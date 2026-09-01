import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { Combatant, TurnRecord } from '../combat';
import type {
  BattleActionPayload,
  BattleEndedPayload,
  BattleJoinPayload,
  BattleReactionPayload,
  BattleTurnResolvedPayload,
  CombatantView,
  SocketData,
  TurnView,
} from './battle-events';
import { ClientEvent, ServerEvent } from './battle-events';
import { BattleSessionService } from './battle-session.service';
import type { TurnResolutionOutcome } from './turn-resolution.service';
import { TurnResolutionService } from './turn-resolution.service';
import { createWsAuthMiddleware } from './ws-auth.middleware';

/** The one room a battle's two participants ever share. */
const battleRoom = (battleId: string): string => `battle:${battleId}`;

/** `Combatant` (engine shape) rendered as the wire's `CombatantView`. */
const toCombatantView = (combatant: Combatant): CombatantView => ({
  userId: combatant.userId,
  combatantId: combatant.id,
  strength: combatant.strength,
  magic: combatant.magic,
  dexterity: combatant.dexterity,
  constitution: combatant.constitution,
  armorClass: combatant.armorClass,
  maxHp: combatant.maxHp,
  currentHp: combatant.currentHp,
  initiative: combatant.initiative,
  reactionAvailable: combatant.reactionAvailable,
  conditions: combatant.conditions.map((condition) => ({
    type: condition.type,
    roundsRemaining: condition.roundsRemaining,
  })),
});

const toTurnView = (turn: TurnRecord): TurnView => ({
  round: turn.round,
  sequence: turn.sequence,
  actorId: turn.actorId,
  kind: turn.kind,
  skillCode: turn.skillCode,
  attackRoll: turn.attackRoll,
  targetValue: turn.targetValue,
  hit: turn.hit,
  critical: turn.critical,
  damage: turn.damage,
});

const toTurnResolvedPayload = (
  outcome: TurnResolutionOutcome,
): BattleTurnResolvedPayload => ({
  battleId: outcome.battleId,
  round: outcome.round,
  turns: outcome.turns.map(toTurnView),
  events: outcome.events,
  combatants: [outcome.actor, outcome.defender].map(toCombatantView),
  defeatedId: outcome.defeatedId,
});

/** `winnerId`/`endedAt` are only ever null when `defeatedId` is — the caller already checked. */
const toEndedPayload = (outcome: TurnResolutionOutcome): BattleEndedPayload => {
  if (outcome.winnerId === null || outcome.endedAt === null) {
    // Unreachable: `TurnResolutionService` always pairs a defeat with both.
    throw new Error(`Battle ${outcome.battleId} ended without a winner`);
  }

  return {
    battleId: outcome.battleId,
    winnerId: outcome.winnerId,
    reason: 'DEFEAT',
    endedAt: outcome.endedAt.toISOString(),
  };
};

/**
 * Transport only: the handshake middleware installed in `afterInit` is the
 * connection-level boundary — a tokenless or invalid-token socket never
 * reaches `handleConnection`. `battle:join` is the message-level boundary:
 * it re-reads participation from the database before granting room
 * membership, never from anything the client claims. Turn resolution and
 * the action/reaction handlers arrive in later slices.
 */
@WebSocketGateway()
export class BattleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(BattleGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly session: BattleSessionService,
    private readonly turnResolution: TurnResolutionService,
  ) {}

  afterInit(server: Server): void {
    const authenticate = createWsAuthMiddleware(this.jwt);

    // `server.use()` expects a void-returning callback; the middleware
    // itself is async, so it is invoked rather than passed directly.
    server.use((socket, next) => {
      void authenticate(socket, next);
    });
  }

  handleConnection(socket: Socket): void {
    const { user } = socket.data as SocketData;
    this.logger.debug(`Socket connected: ${user.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const { user } = socket.data as SocketData;
    this.logger.debug(`Socket disconnected: ${user.id}`);
  }

  /**
   * Admits the sender to `battle:{battleId}` only once `BattleSessionService`
   * confirms participation and status from the database. A non-participant
   * and a non-existent battle both reach this the same way — `admitJoin`
   * never learns which — so both receive the identical generic refusal.
   */
  @SubscribeMessage(ClientEvent.JOIN)
  async handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: BattleJoinPayload,
  ): Promise<void> {
    const { user } = socket.data as SocketData;
    const result = await this.session.admitJoin(payload.battleId, user.id);

    if (!result.ok) {
      socket.emit(ServerEvent.ERROR, {
        ...result.denial,
        event: ClientEvent.JOIN,
      });
      return;
    }

    await socket.join(battleRoom(payload.battleId));
    socket.emit(ServerEvent.STATE, this.session.toStatePayload(result.row));
  }

  /**
   * Declares the active player's action for the round and opens the
   * reaction window (design's sequence diagram 1). Only the defender is
   * told — `socket.to()` excludes the sender, matching the diagram's
   * `G-->>D`. No rule runs here: `admitAction` already ran V1-V5/V7.
   */
  @SubscribeMessage(ClientEvent.ACTION)
  async handleAction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: BattleActionPayload,
  ): Promise<void> {
    const { user } = socket.data as SocketData;
    const result = await this.session.admitAction(
      payload.battleId,
      user.id,
      payload.skillCode,
    );

    if (!result.ok) {
      socket.emit(ServerEvent.ERROR, {
        ...result.denial,
        event: ClientEvent.ACTION,
      });
      return;
    }

    const window = await this.session.declareAction(
      result.row,
      payload.skillCode,
    );
    socket
      .to(battleRoom(payload.battleId))
      .emit(ServerEvent.REACTION_WINDOW, window);
  }

  /**
   * Declares the defender's answer, hands off to the resolver, and
   * broadcasts the outcome to the whole room. A defeat ends the battle;
   * otherwise the incoming actor's round starts before `battle:round_start`
   * goes out (design's sequence diagram 1). No rule runs here either —
   * `admitReaction` already ran the full seven, and `resolve()` owns the
   * claim, the engine call, and persistence.
   */
  @SubscribeMessage(ClientEvent.REACTION)
  async handleReaction(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: BattleReactionPayload,
  ): Promise<void> {
    const { user } = socket.data as SocketData;
    const result = await this.session.admitReaction(
      payload.battleId,
      user.id,
      payload.skillCode,
    );

    if (!result.ok) {
      socket.emit(ServerEvent.ERROR, {
        ...result.denial,
        event: ClientEvent.REACTION,
      });
      return;
    }

    const { row } = result;
    const actionSkillCode = row.pendingActionSkillCode;

    if (actionSkillCode === null) {
      // Unreachable: V3's `reactionWindowOpen` already guarantees a pending
      // action exists whenever a `battle:reaction` reaches this point.
      throw new Error(`Battle ${row.id} has no pending action to react to`);
    }

    const outcome = await this.turnResolution.resolve(
      row.id,
      row.currentRound,
      actionSkillCode,
      payload.skillCode,
    );
    const room = battleRoom(payload.battleId);

    this.server
      .to(room)
      .emit(ServerEvent.TURN_RESOLVED, toTurnResolvedPayload(outcome));

    if (outcome.defeatedId) {
      this.server.to(room).emit(ServerEvent.ENDED, toEndedPayload(outcome));
      return;
    }

    const nextRound = outcome.round + 1;
    const started = await this.turnResolution.startRound(
      nextRound,
      outcome.defender,
    );

    this.server.to(room).emit(ServerEvent.ROUND_START, {
      battleId: row.id,
      round: nextRound,
      activeUserId: outcome.defender.userId,
      events: started.events,
    });
  }
}

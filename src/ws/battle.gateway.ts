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
  BattleOpponentLeftPayload,
  BattleReactionPayload,
  BattleTurnResolvedPayload,
  CombatantView,
  SocketData,
  TurnView,
} from './battle-events';
import { ClientEvent, ServerEvent } from './battle-events';
import { BattleSessionService } from './battle-session.service';
import { ReactionTimerRegistry } from './reaction-timer.registry';
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
  attackTotal: turn.attackTotal,
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
    // `rating` is null only on an idempotent re-emit, where the deltas were
    // spent by a transaction that already committed. Reporting the ratings
    // as unmoved would be a lie; reporting an empty list says plainly that
    // this emission is not the one that moved them.
    ranked: outcome.rating?.ranked ?? false,
    ratingChanges: [...(outcome.rating?.changes ?? [])],
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
    private readonly reactionTimer: ReactionTimerRegistry,
  ) {}

  /**
   * Runs at the top of every handler (design's sequence diagram 2, the
   * LOAD-BEARING lazy path): if this battle's window is already overdue,
   * resolves it and broadcasts the outcome before the triggering message is
   * otherwise processed. The subsequent `admitJoin`/`admitAction`/
   * `admitReaction` re-reads the battle fresh, so it naturally sees the
   * window closed — no special-casing needed beyond this one call.
   */
  private async settleOverdue(battleId: string): Promise<void> {
    const outcome = await this.session.settleOverdue(battleId);

    if (!outcome) {
      return;
    }

    this.reactionTimer.cancel(battleId);

    if (outcome.kind === 'ABANDONED') {
      this.server.to(battleRoom(battleId)).emit(ServerEvent.ENDED, {
        battleId,
        winnerId: outcome.winnerId,
        reason: 'ABANDONMENT',
        endedAt: outcome.endedAt.toISOString(),
        ranked: outcome.rating.ranked,
        ratingChanges: [...outcome.rating.changes],
      });
      return;
    }

    await this.emitResolution(battleId, outcome.outcome);
  }

  /**
   * Shared by the lazy path above and `handleReaction` below — the ONE
   * place a resolved turn is broadcast, so a fresh resolve and a lazily
   * settled one converge on byte-identical wire behavior.
   */
  private async emitResolution(
    battleId: string,
    outcome: TurnResolutionOutcome,
  ): Promise<void> {
    const room = battleRoom(battleId);

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
      battleId,
      round: nextRound,
      activeUserId: outcome.defender.userId,
      events: started.events,
    });
  }

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

  /**
   * Design's sequence diagram 3: records the 2-minute abandonment deadline
   * and notifies the room, but only for a socket that actually joined a
   * battle — `battleId` is set on `socket.data` by `handleJoin`, since
   * Socket.IO has already left every room by the time `disconnect` fires.
   * No timer is armed here; `settleOverdue` is the only thing that ever
   * acts on this, lazily, on the survivor's next message.
   */
  async handleDisconnect(socket: Socket): Promise<void> {
    const { user, battleId } = socket.data as SocketData;
    this.logger.debug(`Socket disconnected: ${user.id}`);

    if (!battleId) {
      return;
    }

    const deadline = await this.session.recordDisconnect(battleId, user.id);

    if (!deadline) {
      return;
    }

    const payload: BattleOpponentLeftPayload = {
      battleId,
      userId: user.id,
      deadline: deadline.toISOString(),
    };
    this.server
      .to(battleRoom(battleId))
      .emit(ServerEvent.OPPONENT_LEFT, payload);
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
    await this.settleOverdue(payload.battleId);

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
    // Remembered for `handleDisconnect`, which cannot read it back from the
    // socket's rooms once it has actually disconnected.
    (socket.data as SocketData).battleId = payload.battleId;
    socket.emit(
      ServerEvent.STATE,
      await this.session.toStatePayload(result.row),
    );
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
    await this.settleOverdue(payload.battleId);

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

    // The comfort layer: the SAME resolver the reaction handler and the
    // lazy path call, never a separate resolution of its own.
    this.reactionTimer.arm(payload.battleId, new Date(window.deadline), () => {
      void this.turnResolution
        .resolve(
          payload.battleId,
          result.row.currentRound,
          payload.skillCode,
          null,
        )
        .then((outcome) => this.emitResolution(payload.battleId, outcome));
    });
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
    // If the window already expired, this closes it in the database; V3's
    // `reactionWindowOpen` then naturally refuses this same reaction below
    // as `NO_OPEN_WINDOW`, with no special-casing needed here.
    await this.settleOverdue(payload.battleId);

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

    this.reactionTimer.cancel(payload.battleId);
    const outcome = await this.turnResolution.resolve(
      row.id,
      row.currentRound,
      actionSkillCode,
      payload.skillCode,
    );
    await this.emitResolution(payload.battleId, outcome);
  }
}

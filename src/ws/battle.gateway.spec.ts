import type { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';

import type { Combatant } from '../combat';
import { BattleGateway } from './battle.gateway';
import type {
  BattleActionPayload,
  BattleReactionPayload,
  SocketData,
} from './battle-events';
import { ClientEvent, ServerEvent } from './battle-events';
import type { BattleSessionService } from './battle-session.service';
import type { ReactionTimerRegistry } from './reaction-timer.registry';
import type {
  TurnResolutionOutcome,
  TurnResolutionService,
} from './turn-resolution.service';

const BATTLE_ID = '33333333-0000-4000-8000-000000000003';
const ACTOR_USER_ID = '11111111-0000-4000-8000-000000000001';
const DEFENDER_USER_ID = '22222222-0000-4000-8000-000000000002';
const ROOM = `battle:${BATTLE_ID}`;

/**
 * Hand-built fake socket, per the repo's convention — no `TestingModule`.
 * Returns the raw mocks alongside the typed socket: asserting on
 * `socket.emit` directly trips `@typescript-eslint/unbound-method`.
 */
const fakeSocket = (userId: string) => {
  const data: SocketData = { user: { id: userId, username: 'x' } };
  const emit = jest.fn();
  const toEmit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit: toEmit });
  // Socket.IO resolves `join`, and `handleJoin` awaits it before answering.
  const join = jest.fn().mockResolvedValue(undefined);

  return {
    socket: { data, emit, to, join } as unknown as Socket,
    emit,
    to,
    toEmit,
    join,
  };
};

const combatant = (id: string, userId: string): Combatant => ({
  id,
  userId,
  strength: 15,
  magic: 10,
  dexterity: 10,
  constitution: 10,
  armorClass: 11,
  maxHp: 30,
  currentHp: 27,
  initiative: 10,
  reactionAvailable: true,
  conditions: [],
});

const actorCombatant = combatant('combatant-actor', ACTOR_USER_ID);
const defenderCombatant = combatant('combatant-defender', DEFENDER_USER_ID);

const baseOutcome: TurnResolutionOutcome = {
  battleId: BATTLE_ID,
  round: 1,
  turns: [
    {
      round: 1,
      sequence: 1,
      actorId: actorCombatant.id,
      kind: 'ACTION',
      skillCode: 'POWER_STRIKE',
      attackTotal: 19,
      attackRoll: 17,
      targetValue: 17,
      hit: true,
      critical: false,
      damage: 3,
    },
    {
      round: 1,
      sequence: 2,
      actorId: defenderCombatant.id,
      kind: 'REACTION',
      attackTotal: null,
      skillCode: 'PARRY',
      attackRoll: null,
      targetValue: null,
      hit: null,
      critical: false,
      damage: 0,
    },
  ],
  actor: actorCombatant,
  defender: defenderCombatant,
  events: [],
  defeatedId: null,
  winnerId: null,
  endedAt: null,
};

describe('BattleGateway — action and reaction handlers', () => {
  const admitJoin = jest.fn();
  const admitAction = jest.fn();
  const admitReaction = jest.fn();
  const declareAction = jest.fn();
  const settleOverdue = jest.fn();
  const toStatePayload = jest.fn();
  const recordDisconnect = jest.fn();
  const session = {
    admitJoin,
    admitAction,
    admitReaction,
    declareAction,
    settleOverdue,
    toStatePayload,
    recordDisconnect,
  } as unknown as BattleSessionService;

  const resolve = jest.fn();
  const startRound = jest.fn();
  const turnResolution = {
    resolve,
    startRound,
  } as unknown as TurnResolutionService;

  const arm = jest.fn();
  const cancel = jest.fn();
  const reactionTimer = { arm, cancel } as unknown as ReactionTimerRegistry;

  const jwt = {} as unknown as JwtService;

  let gateway: BattleGateway;
  let roomEmit: jest.Mock;
  let server: { to: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    // Nothing overdue by default — the lazy path is exercised explicitly.
    settleOverdue.mockResolvedValue(null);
    gateway = new BattleGateway(jwt, session, turnResolution, reactionTimer);
    roomEmit = jest.fn();
    server = { to: jest.fn().mockReturnValue({ emit: roomEmit }) };
    (gateway as unknown as { server: Server }).server =
      server as unknown as Server;
  });

  describe('handleJoin', () => {
    it('settles an overdue window before admitting the join (reconnect mid-window)', async () => {
      admitJoin.mockResolvedValue({ ok: true, row: { id: BATTLE_ID } });
      toStatePayload.mockResolvedValue({ battleId: BATTLE_ID });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleJoin(socket, { battleId: BATTLE_ID });

      expect(settleOverdue).toHaveBeenCalledWith(BATTLE_ID);
      expect(admitJoin).toHaveBeenCalled();
    });

    it('remembers the joined battleId on the socket, for a later disconnect', async () => {
      admitJoin.mockResolvedValue({ ok: true, row: { id: BATTLE_ID } });
      toStatePayload.mockResolvedValue({ battleId: BATTLE_ID });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleJoin(socket, { battleId: BATTLE_ID });

      expect((socket.data as SocketData).battleId).toBe(BATTLE_ID);
    });
  });

  describe('handleAction', () => {
    const payload: BattleActionPayload = {
      battleId: BATTLE_ID,
      skillCode: 'POWER_STRIKE',
    };

    it('settles an overdue window before admitting the new action', async () => {
      admitAction.mockResolvedValue({
        ok: false,
        denial: { code: 'NOT_YOUR_TURN', message: 'it is not your turn' },
      });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);

      expect(settleOverdue).toHaveBeenCalledWith(BATTLE_ID);
    });

    it('cancels the timer and broadcasts the outcome when the window was already overdue', async () => {
      settleOverdue.mockResolvedValue({
        kind: 'TURN_RESOLVED',
        outcome: baseOutcome,
      });
      startRound.mockResolvedValue({ actor: defenderCombatant, events: [] });
      admitAction.mockResolvedValue({
        ok: false,
        denial: { code: 'NOT_YOUR_TURN', message: 'stale action' },
      });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);

      expect(cancel).toHaveBeenCalledWith(BATTLE_ID);
      expect(server.to).toHaveBeenCalledWith(ROOM);
      expect(roomEmit).toHaveBeenCalledWith(
        ServerEvent.TURN_RESOLVED,
        expect.objectContaining({ battleId: BATTLE_ID }),
      );
    });

    it('arms the reaction timer with the declared deadline once the window opens', async () => {
      const row = { id: BATTLE_ID, currentRound: 1 };
      admitAction.mockResolvedValue({ ok: true, row });
      const window = {
        battleId: BATTLE_ID,
        round: 1,
        actorUserId: ACTOR_USER_ID,
        actionSkillCode: 'POWER_STRIKE',
        deadline: '2099-01-01T00:00:00.000Z',
        remainingMs: 15_000,
        applicableSkillCodes: [],
      };
      declareAction.mockResolvedValue(window);
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);

      expect(arm).toHaveBeenCalledWith(
        BATTLE_ID,
        new Date(window.deadline),
        expect.any(Function),
      );
    });

    it('the armed callback resolves through the exact same TurnResolutionService.resolve used by handleReaction — no second resolution path', async () => {
      const row = { id: BATTLE_ID, currentRound: 1 };
      admitAction.mockResolvedValue({ ok: true, row });
      declareAction.mockResolvedValue({
        battleId: BATTLE_ID,
        round: 1,
        actorUserId: ACTOR_USER_ID,
        actionSkillCode: 'POWER_STRIKE',
        deadline: '2099-01-01T00:00:00.000Z',
        remainingMs: 15_000,
        applicableSkillCodes: [],
      });
      resolve.mockResolvedValue(baseOutcome);
      startRound.mockResolvedValue({ actor: defenderCombatant, events: [] });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);
      // `jest.fn()` types its calls as `any[]`, so the tuple is named once
      // here rather than indexed raw — typed linting refuses the latter.
      const [, , onExpire] = arm.mock.calls[0] as [
        string,
        Date,
        () => Promise<void>,
      ];
      await onExpire();

      expect(resolve).toHaveBeenCalledWith(BATTLE_ID, 1, 'POWER_STRIKE', null);
      expect(roomEmit).toHaveBeenCalledWith(
        ServerEvent.TURN_RESOLVED,
        expect.objectContaining({ battleId: BATTLE_ID }),
      );
    });

    it('emits battle:error and never declares the action when authorization is denied', async () => {
      admitAction.mockResolvedValue({
        ok: false,
        denial: { code: 'NOT_YOUR_TURN', message: 'It is not your turn' },
      });
      const { socket, emit } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);

      expect(emit).toHaveBeenCalledWith(ServerEvent.ERROR, {
        code: 'NOT_YOUR_TURN',
        message: 'It is not your turn',
        event: ClientEvent.ACTION,
      });
      expect(declareAction).not.toHaveBeenCalled();
    });

    it('declares the action and emits battle:reaction_window to everyone but the actor', async () => {
      const row = { id: BATTLE_ID };
      admitAction.mockResolvedValue({ ok: true, row });
      const window = {
        battleId: BATTLE_ID,
        round: 1,
        actorUserId: ACTOR_USER_ID,
        actionSkillCode: 'POWER_STRIKE',
        deadline: '2099-01-01T00:00:00.000Z',
        remainingMs: 15_000,
        applicableSkillCodes: ['PARRY'],
      };
      declareAction.mockResolvedValue(window);
      const { socket, to, toEmit } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleAction(socket, payload);

      expect(declareAction).toHaveBeenCalledWith(row, 'POWER_STRIKE');
      expect(to).toHaveBeenCalledWith(ROOM);
      expect(toEmit).toHaveBeenCalledWith(ServerEvent.REACTION_WINDOW, window);
    });
  });

  describe('handleReaction', () => {
    const payload: BattleReactionPayload = {
      battleId: BATTLE_ID,
      skillCode: 'PARRY',
    };
    const row = {
      id: BATTLE_ID,
      currentRound: 1,
      pendingActionSkillCode: 'POWER_STRIKE',
    };

    it('emits battle:error and never resolves when authorization is denied', async () => {
      admitReaction.mockResolvedValue({
        ok: false,
        denial: { code: 'NO_OPEN_WINDOW', message: 'no window' },
      });
      const { socket, emit } = fakeSocket(DEFENDER_USER_ID);

      await gateway.handleReaction(socket, payload);

      expect(emit).toHaveBeenCalledWith(ServerEvent.ERROR, {
        code: 'NO_OPEN_WINDOW',
        message: 'no window',
        event: ClientEvent.REACTION,
      });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('resolves through the service and broadcasts battle:turn_resolved to the whole room', async () => {
      admitReaction.mockResolvedValue({ ok: true, row });
      resolve.mockResolvedValue(baseOutcome);
      startRound.mockResolvedValue({ actor: defenderCombatant, events: [] });
      const { socket } = fakeSocket(DEFENDER_USER_ID);

      await gateway.handleReaction(socket, payload);

      expect(resolve).toHaveBeenCalledWith(
        BATTLE_ID,
        1,
        'POWER_STRIKE',
        'PARRY',
      );
      expect(server.to).toHaveBeenCalledWith(ROOM);
      expect(roomEmit).toHaveBeenCalledWith(
        ServerEvent.TURN_RESOLVED,
        expect.objectContaining({
          battleId: BATTLE_ID,
          round: 1,
          defeatedId: null,
          turns: [
            expect.objectContaining({ skillCode: 'POWER_STRIKE' }),
            expect.objectContaining({ skillCode: 'PARRY' }),
          ],
        }),
      );
      expect(cancel).toHaveBeenCalledWith(BATTLE_ID);
    });

    it('starts the next round for the incoming actor when nobody is defeated', async () => {
      admitReaction.mockResolvedValue({ ok: true, row });
      resolve.mockResolvedValue(baseOutcome);
      startRound.mockResolvedValue({ actor: defenderCombatant, events: [] });
      const { socket } = fakeSocket(DEFENDER_USER_ID);

      await gateway.handleReaction(socket, payload);

      expect(startRound).toHaveBeenCalledWith(2, defenderCombatant);
      expect(roomEmit).toHaveBeenCalledWith(ServerEvent.ROUND_START, {
        battleId: BATTLE_ID,
        round: 2,
        activeUserId: DEFENDER_USER_ID,
        events: [],
      });
    });

    it('emits battle:ended instead of starting a round when the resolution ends the battle', async () => {
      const endedAt = new Date('2099-01-01T00:00:00.000Z');
      const outcomeEnded: TurnResolutionOutcome = {
        ...baseOutcome,
        defeatedId: defenderCombatant.id,
        winnerId: actorCombatant.userId,
        endedAt,
      };
      admitReaction.mockResolvedValue({ ok: true, row });
      resolve.mockResolvedValue(outcomeEnded);
      const { socket } = fakeSocket(DEFENDER_USER_ID);

      await gateway.handleReaction(socket, payload);

      expect(startRound).not.toHaveBeenCalled();
      expect(roomEmit).toHaveBeenCalledWith(ServerEvent.ENDED, {
        battleId: BATTLE_ID,
        winnerId: actorCombatant.userId,
        reason: 'DEFEAT',
        endedAt: endedAt.toISOString(),
      });
    });
  });

  describe('handleJoin — settleOverdue finding an abandoned battle', () => {
    it('emits battle:ended with reason ABANDONMENT before the join is otherwise admitted', async () => {
      const endedAt = new Date('2099-01-01T00:00:00.000Z');
      settleOverdue.mockResolvedValue({
        kind: 'ABANDONED',
        winnerId: ACTOR_USER_ID,
        endedAt,
      });
      admitJoin.mockResolvedValue({
        ok: false,
        denial: { code: 'WRONG_STATUS', message: 'the battle is finished' },
      });
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleJoin(socket, { battleId: BATTLE_ID });

      expect(cancel).toHaveBeenCalledWith(BATTLE_ID);
      expect(server.to).toHaveBeenCalledWith(ROOM);
      expect(roomEmit).toHaveBeenCalledWith(ServerEvent.ENDED, {
        battleId: BATTLE_ID,
        winnerId: ACTOR_USER_ID,
        reason: 'ABANDONMENT',
        endedAt: endedAt.toISOString(),
      });
    });
  });

  describe('handleDisconnect', () => {
    it('does nothing when the socket never joined a battle room', async () => {
      const { socket } = fakeSocket(ACTOR_USER_ID);

      await gateway.handleDisconnect(socket);

      expect(recordDisconnect).not.toHaveBeenCalled();
      expect(roomEmit).not.toHaveBeenCalled();
    });

    it('records the disconnect and notifies the room when a joined participant drops', async () => {
      const deadline = new Date('2099-01-01T00:00:00.000Z');
      recordDisconnect.mockResolvedValue(deadline);
      const { socket } = fakeSocket(ACTOR_USER_ID);
      (socket.data as SocketData).battleId = BATTLE_ID;

      await gateway.handleDisconnect(socket);

      expect(recordDisconnect).toHaveBeenCalledWith(BATTLE_ID, ACTOR_USER_ID);
      expect(server.to).toHaveBeenCalledWith(ROOM);
      expect(roomEmit).toHaveBeenCalledWith(ServerEvent.OPPONENT_LEFT, {
        battleId: BATTLE_ID,
        userId: ACTOR_USER_ID,
        deadline: deadline.toISOString(),
      });
    });

    it('emits nothing when the battle could not be recorded as abandoned', async () => {
      recordDisconnect.mockResolvedValue(null);
      const { socket } = fakeSocket(ACTOR_USER_ID);
      (socket.data as SocketData).battleId = BATTLE_ID;

      await gateway.handleDisconnect(socket);

      expect(roomEmit).not.toHaveBeenCalled();
    });
  });
});

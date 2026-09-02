import { BattleStatus } from '../generated/prisma/enums';
import type { BattleSessionRow } from '../battle/battle.mapper';
import type { BattleService } from '../battle/battle.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionContext } from './rules/message-checks';
import { BattleSessionService } from './battle-session.service';
import type {
  TurnResolutionOutcome,
  TurnResolutionService,
} from './turn-resolution.service';

const ME = '11111111-0000-4000-8000-000000000001';
const RIVAL = '22222222-0000-4000-8000-000000000002';
const STRANGER = '99999999-0000-4000-8000-000000000009';
const BATTLE_ID = '33333333-0000-4000-8000-000000000003';

/** One combatant row shaped exactly like `findForParticipant`'s include. */
const combatant = (
  userId: string,
  initiative: number,
  overrides: Record<string, unknown> = {},
) => ({
  id: `combatant-${userId}`,
  userId,
  buildId: `build-${userId}`,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  armorClass: 12,
  maxHp: 20,
  currentHp: 20,
  initiative,
  reactionAvailable: true,
  conditions: [],
  ...overrides,
});

/** One `BuildSkill` join row shaped like `kitFor`'s `include: { skill: true }` read. */
const kitEntry = (
  code: string,
  type: 'ACTION' | 'REACTION',
  requiredAttribute: string = type === 'ACTION' ? 'STRENGTH' : 'DEXTERITY',
) => ({ skill: { code, type, requiredAttribute } });

const acceptedRow = (
  overrides: Record<string, unknown> = {},
): BattleSessionRow =>
  ({
    id: BATTLE_ID,
    challengerId: ME,
    opponentId: RIVAL,
    status: BattleStatus.ACCEPTED,
    currentRound: 0,
    activeUserId: null,
    combatants: [combatant(ME, 12), combatant(RIVAL, 9)],
    turns: [],
    pendingActionSkillCode: null,
    reactionDeadline: null,
    disconnectedUserId: null,
    disconnectDeadline: null,
    ...overrides,
  }) as unknown as BattleSessionRow;

/** A JOIN context, ready for the one field a test wants to change. */
const joinCtx = (overrides: Partial<SessionContext> = {}): SessionContext => ({
  intent: 'JOIN',
  actorId: ME,
  declaredSkillCode: null,
  isParticipant: true,
  status: BattleStatus.ACCEPTED,
  activeUserId: null,
  reactionWindowOpen: false,
  actor: null,
  slotOccupied: false,
  ...overrides,
});

describe('BattleSessionService', () => {
  const findForParticipant = jest.fn();
  const battleService = { findForParticipant } as unknown as BattleService;
  const update = jest.fn();
  const findUnique = jest.fn();
  const buildSkillFindMany = jest.fn();
  const skillFindUniqueOrThrow = jest.fn();
  const resolve = jest.fn();
  const turnResolution = { resolve } as unknown as TurnResolutionService;
  const prisma = {
    battle: { update, findUnique },
    buildSkill: { findMany: buildSkillFindMany },
    skill: { findUniqueOrThrow: skillFindUniqueOrThrow },
  } as unknown as PrismaService;
  const service = new BattleSessionService(
    battleService,
    prisma,
    turnResolution,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('load', () => {
    it('delegates to findForParticipant, unmodified', async () => {
      const row = acceptedRow();
      findForParticipant.mockResolvedValue(row);

      await expect(service.load(BATTLE_ID, ME)).resolves.toBe(row);
      expect(findForParticipant).toHaveBeenCalledWith(BATTLE_ID, ME);
    });

    it('returns null for a battle the caller cannot see', async () => {
      findForParticipant.mockResolvedValue(null);

      await expect(service.load(BATTLE_ID, ME)).resolves.toBeNull();
    });
  });

  describe('authorizeMessage', () => {
    it('delegates to the shared CHECKS pipeline and admits a valid join', () => {
      expect(service.authorizeMessage('JOIN', joinCtx())).toBeNull();
    });

    it("refuses a non-participant with REST's exact generic message", () => {
      expect(
        service.authorizeMessage('JOIN', joinCtx({ isParticipant: false })),
      ).toEqual({ code: 'NOT_FOUND', message: 'Battle not found' });
    });
  });

  describe('admitJoin', () => {
    it('refuses a non-existent battle with the generic refusal', async () => {
      findForParticipant.mockResolvedValue(null);

      await expect(service.admitJoin('does-not-exist', ME)).resolves.toEqual({
        ok: false,
        denial: { code: 'NOT_FOUND', message: 'Battle not found' },
      });
    });

    it('refuses a stranger to a real battle, byte-identical to the non-existent case', async () => {
      // `findForParticipant` already scopes to the caller, so a stranger to
      // a real battle resolves the same `null` as a battle that never
      // existed — this is the whole point of that read.
      findForParticipant.mockResolvedValue(null);

      const strangerResult = await service.admitJoin(BATTLE_ID, STRANGER);
      const missingResult = await service.admitJoin('does-not-exist', ME);

      expect(strangerResult).toEqual(missingResult);
      expect(update).not.toHaveBeenCalled();
    });

    it('fires the START transition for a participant joining an ACCEPTED battle', async () => {
      findForParticipant.mockResolvedValue(acceptedRow());
      update.mockResolvedValue(undefined);

      const result = await service.admitJoin(BATTLE_ID, ME);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('expected admission');
      }

      // Higher initiative (ME: 12 vs RIVAL: 9) goes first.
      expect(result.row.status).toBe(BattleStatus.IN_PROGRESS);
      expect(result.row.currentRound).toBe(1);
      expect(result.row.activeUserId).toBe(ME);
      expect(update).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: {
          status: BattleStatus.IN_PROGRESS,
          currentRound: 1,
          activeUserId: ME,
          startedAt: expect.any(Date) as Date,
        },
      });
    });

    it('breaks an initiative tie in favor of the challenger', async () => {
      findForParticipant.mockResolvedValue(
        acceptedRow({ combatants: [combatant(ME, 10), combatant(RIVAL, 10)] }),
      );
      update.mockResolvedValue(undefined);

      const result = await service.admitJoin(BATTLE_ID, RIVAL);

      if (!result.ok) {
        throw new Error('expected admission');
      }
      expect(result.row.activeUserId).toBe(ME);
    });

    it('does not re-fire START for a battle already IN_PROGRESS', async () => {
      findForParticipant.mockResolvedValue(
        acceptedRow({
          status: BattleStatus.IN_PROGRESS,
          currentRound: 3,
          activeUserId: RIVAL,
        }),
      );

      const result = await service.admitJoin(BATTLE_ID, ME);

      expect(update).not.toHaveBeenCalled();
      if (!result.ok) {
        throw new Error('expected admission');
      }
      expect(result.row.status).toBe(BattleStatus.IN_PROGRESS);
      expect(result.row.currentRound).toBe(3);
      expect(result.row.activeUserId).toBe(RIVAL);
    });

    it('refuses a participant whose battle is not yet ACCEPTED or IN_PROGRESS', async () => {
      findForParticipant.mockResolvedValue(
        acceptedRow({ status: BattleStatus.PENDING }),
      );

      const result = await service.admitJoin(BATTLE_ID, ME);

      expect(result).toEqual({
        ok: false,
        denial: {
          code: 'WRONG_STATUS',
          message:
            'The battle must be accepted or in_progress for that, and this one is pending',
        },
      });
      expect(update).not.toHaveBeenCalled();
    });
  });

  /** A fight in progress, ME active, ready for ACTION/REACTION admission. */
  const inProgressRow = (
    overrides: Record<string, unknown> = {},
  ): BattleSessionRow =>
    acceptedRow({
      status: BattleStatus.IN_PROGRESS,
      currentRound: 1,
      activeUserId: ME,
      pendingActionSkillCode: null,
      reactionDeadline: null,
      ...overrides,
    });

  describe('admitAction', () => {
    it('refuses a player declaring an action out of turn', async () => {
      findForParticipant.mockResolvedValue(
        inProgressRow({ activeUserId: RIVAL }),
      );
      // The context is built in full before `authorize()` decides — same
      // discipline as V1/V2 — so the sender's kit is still read even though
      // V3 is the one that ultimately denies this message.
      buildSkillFindMany.mockResolvedValue([]);

      const result = await service.admitAction(BATTLE_ID, ME, 'POWER_STRIKE');

      expect(result).toEqual({
        ok: false,
        denial: { code: 'NOT_YOUR_TURN', message: 'It is not your turn' },
      });
    });

    it("admits the active player's valid ACTION-type skill from their kit", async () => {
      findForParticipant.mockResolvedValue(inProgressRow());
      buildSkillFindMany.mockResolvedValue([
        kitEntry('POWER_STRIKE', 'ACTION'),
      ]);

      const result = await service.admitAction(BATTLE_ID, ME, 'POWER_STRIKE');

      expect(result.ok).toBe(true);
      expect(buildSkillFindMany).toHaveBeenCalledWith({
        where: { buildId: `build-${ME}` },
        include: { skill: true },
      });
    });

    it("refuses a skill outside the active player's kit", async () => {
      findForParticipant.mockResolvedValue(inProgressRow());
      buildSkillFindMany.mockResolvedValue([]);

      const result = await service.admitAction(BATTLE_ID, ME, 'POWER_STRIKE');

      expect(result).toEqual({
        ok: false,
        denial: {
          code: 'SKILL_NOT_IN_KIT',
          message: 'That skill is not part of your kit for this battle',
        },
      });
    });
  });

  describe('admitReaction', () => {
    it('admits an explicit decline while the window is open', async () => {
      findForParticipant.mockResolvedValue(
        inProgressRow({ reactionDeadline: new Date(Date.now() + 60_000) }),
      );
      buildSkillFindMany.mockResolvedValue([]);

      const result = await service.admitReaction(BATTLE_ID, RIVAL, null);

      expect(result.ok).toBe(true);
    });

    it('refuses a reaction when no window is open', async () => {
      findForParticipant.mockResolvedValue(inProgressRow());
      buildSkillFindMany.mockResolvedValue([kitEntry('PARRY', 'REACTION')]);

      const result = await service.admitReaction(BATTLE_ID, RIVAL, 'PARRY');

      expect(result).toEqual({
        ok: false,
        denial: {
          code: 'NO_OPEN_WINDOW',
          message: 'There is no reaction window open for you to answer',
        },
      });
    });

    it('refuses a reaction skill outside the defender kit', async () => {
      findForParticipant.mockResolvedValue(
        inProgressRow({ reactionDeadline: new Date(Date.now() + 60_000) }),
      );
      buildSkillFindMany.mockResolvedValue([]);

      const result = await service.admitReaction(BATTLE_ID, RIVAL, 'PARRY');

      expect(result).toEqual({
        ok: false,
        denial: {
          code: 'SKILL_NOT_IN_KIT',
          message: 'That skill is not part of your kit for this battle',
        },
      });
    });
  });

  describe('declareAction', () => {
    it('persists the pending action with a 15s deadline and returns the window payload', async () => {
      const row = inProgressRow();
      update.mockResolvedValue(undefined);
      buildSkillFindMany.mockResolvedValue([]);
      skillFindUniqueOrThrow.mockResolvedValue({
        requiredAttribute: 'STRENGTH',
      });
      const now = Date.now();

      const window = await service.declareAction(row, 'POWER_STRIKE');

      expect(update).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: {
          pendingActionSkillCode: 'POWER_STRIKE',
          reactionDeadline: expect.any(Date) as Date,
        },
      });
      expect(window.battleId).toBe(BATTLE_ID);
      expect(window.round).toBe(1);
      expect(window.actorUserId).toBe(ME);
      expect(window.actionSkillCode).toBe('POWER_STRIKE');
      expect(window.remainingMs).toBe(15_000);
      expect(new Date(window.deadline).getTime()).toBeGreaterThanOrEqual(
        now + 14_000,
      );
    });

    it('computes applicableSkillCodes from the defender kit through REACTION_TABLE', async () => {
      const row = inProgressRow();
      update.mockResolvedValue(undefined);
      skillFindUniqueOrThrow.mockResolvedValue({ requiredAttribute: 'MAGIC' });
      buildSkillFindMany.mockResolvedValue([
        kitEntry('PARRY', 'REACTION', 'STRENGTH'),
        kitEntry('ARCANE_WARD', 'REACTION', 'MAGIC'),
      ]);

      const window = await service.declareAction(row, 'FIREBALL');

      // PARRY only answers PHYSICAL; ARCANE_WARD answers MAGIC, matching a
      // MAGIC-attribute action — only ARCANE_WARD survives the filter.
      expect(window.applicableSkillCodes).toEqual(['ARCANE_WARD']);
      expect(buildSkillFindMany).toHaveBeenCalledWith({
        where: { buildId: `build-${RIVAL}` },
        include: { skill: true },
      });
    });
  });

  describe('settleOverdue', () => {
    const outcome: TurnResolutionOutcome = {
      battleId: BATTLE_ID,
      round: 1,
      turns: [],
      actor: { reactionAvailable: true } as never,
      defender: { reactionAvailable: true } as never,
      events: [],
      defeatedId: null,
      winnerId: null,
      endedAt: null,
    };

    it('does nothing when the battle has no pending action', async () => {
      findUnique.mockResolvedValue({
        currentRound: 1,
        pendingActionSkillCode: null,
        reactionDeadline: null,
        disconnectedUserId: null,
        disconnectDeadline: null,
      });

      await expect(service.settleOverdue(BATTLE_ID)).resolves.toBeNull();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('does nothing while the deadline has not yet passed', async () => {
      findUnique.mockResolvedValue({
        currentRound: 1,
        pendingActionSkillCode: 'POWER_STRIKE',
        reactionDeadline: new Date(Date.now() + 60_000),
        disconnectedUserId: null,
        disconnectDeadline: null,
      });

      await expect(service.settleOverdue(BATTLE_ID)).resolves.toBeNull();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('resolves an overdue window with reaction: null, before any authorize check runs', async () => {
      findUnique.mockResolvedValue({
        currentRound: 1,
        pendingActionSkillCode: 'POWER_STRIKE',
        reactionDeadline: new Date(Date.now() - 1_000),
        disconnectedUserId: null,
        disconnectDeadline: null,
      });
      resolve.mockResolvedValue(outcome);

      const result = await service.settleOverdue(BATTLE_ID);

      // Expiry never spends the reaction — the defender's `reactionAvailable`
      // is preserved by `TurnResolutionService.resolve`'s own rule (never
      // re-derived here), not by any special case in `settleOverdue`.
      expect(resolve).toHaveBeenCalledWith(BATTLE_ID, 1, 'POWER_STRIKE', null);
      expect(result).toEqual({ kind: 'TURN_RESOLVED', outcome });
    });

    /** A battle IN_PROGRESS, ready for the abandonment branch. */
    const abandonableBattle = (overrides: Record<string, unknown> = {}) => ({
      status: BattleStatus.IN_PROGRESS,
      challengerId: ME,
      opponentId: RIVAL,
      currentRound: 1,
      pendingActionSkillCode: null,
      reactionDeadline: null,
      disconnectedUserId: null,
      disconnectDeadline: null,
      ...overrides,
    });

    it('does nothing while the disconnect deadline has not yet passed', async () => {
      findUnique.mockResolvedValue(
        abandonableBattle({
          disconnectedUserId: RIVAL,
          disconnectDeadline: new Date(Date.now() + 60_000),
        }),
      );

      await expect(service.settleOverdue(BATTLE_ID)).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it("closes the battle via closeBattle in the survivor's favor once the disconnect deadline has passed", async () => {
      findUnique.mockResolvedValue(
        abandonableBattle({
          disconnectedUserId: RIVAL,
          disconnectDeadline: new Date(Date.now() - 1_000),
        }),
      );
      update.mockResolvedValue(undefined);

      const result = await service.settleOverdue(BATTLE_ID);

      expect(result).toEqual({
        kind: 'ABANDONED',
        winnerId: ME,
        endedAt: expect.any(Date) as Date,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: {
          status: BattleStatus.FINISHED,
          winnerId: ME,
          endedAt: expect.any(Date) as Date,
          disconnectedUserId: null,
          disconnectDeadline: null,
        },
      });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('checks abandonment before any pending reaction window, closing the battle first', async () => {
      findUnique.mockResolvedValue(
        abandonableBattle({
          pendingActionSkillCode: 'POWER_STRIKE',
          reactionDeadline: new Date(Date.now() - 1_000),
          disconnectedUserId: ME,
          disconnectDeadline: new Date(Date.now() - 1_000),
        }),
      );
      update.mockResolvedValue(undefined);

      const result = await service.settleOverdue(BATTLE_ID);

      expect(result).toEqual({
        kind: 'ABANDONED',
        winnerId: RIVAL,
        endedAt: expect.any(Date) as Date,
      });
      expect(resolve).not.toHaveBeenCalled();
    });

    it('never re-closes a battle abandonment already found not IN_PROGRESS', async () => {
      findUnique.mockResolvedValue(
        abandonableBattle({
          status: BattleStatus.FINISHED,
          disconnectedUserId: RIVAL,
          disconnectDeadline: new Date(Date.now() - 1_000),
        }),
      );

      await expect(service.settleOverdue(BATTLE_ID)).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('toStatePayload', () => {
    it('assembles battleId, status, currentRound, activeUserId, combatants, turns, no window and no disconnect', async () => {
      const row = acceptedRow({
        status: BattleStatus.IN_PROGRESS,
        currentRound: 2,
        activeUserId: ME,
        turns: [
          {
            round: 1,
            sequence: 1,
            actorId: 'combatant-11111111-0000-4000-8000-000000000001',
            kind: 'ACTION',
            skillCode: 'POWER_STRIKE',
            attackRoll: 17,
            targetValue: 12,
            hit: true,
            critical: false,
            damage: 5,
          },
          {
            round: 1,
            sequence: 2,
            actorId: 'combatant-22222222-0000-4000-8000-000000000002',
            kind: 'REACTION',
            skillCode: null,
            attackRoll: null,
            targetValue: null,
            hit: null,
            critical: false,
            damage: 0,
          },
        ],
      });

      await expect(service.toStatePayload(row)).resolves.toEqual({
        battleId: BATTLE_ID,
        status: BattleStatus.IN_PROGRESS,
        currentRound: 2,
        activeUserId: ME,
        combatants: [
          {
            userId: ME,
            combatantId: 'combatant-11111111-0000-4000-8000-000000000001',
            strength: 15,
            magic: 13,
            dexterity: 12,
            constitution: 10,
            armorClass: 12,
            maxHp: 20,
            currentHp: 20,
            initiative: 12,
            reactionAvailable: true,
            conditions: [],
          },
          {
            userId: RIVAL,
            combatantId: 'combatant-22222222-0000-4000-8000-000000000002',
            strength: 15,
            magic: 13,
            dexterity: 12,
            constitution: 10,
            armorClass: 12,
            maxHp: 20,
            currentHp: 20,
            initiative: 9,
            reactionAvailable: true,
            conditions: [],
          },
        ],
        turns: [
          expect.objectContaining({
            round: 1,
            sequence: 1,
            skillCode: 'POWER_STRIKE',
          }),
          expect.objectContaining({ round: 1, sequence: 2, skillCode: null }),
        ],
        openWindow: null,
        opponentLeft: null,
      });
    });

    it("includes the open window with its remaining time and the defender's applicable reaction skills", async () => {
      const deadline = new Date(Date.now() + 9_000);
      const row = acceptedRow({
        status: BattleStatus.IN_PROGRESS,
        currentRound: 1,
        activeUserId: ME,
        pendingActionSkillCode: 'POWER_STRIKE',
        reactionDeadline: deadline,
      });
      skillFindUniqueOrThrow.mockResolvedValue({
        requiredAttribute: 'STRENGTH',
      });
      buildSkillFindMany.mockResolvedValue([
        kitEntry('PARRY', 'REACTION', 'STRENGTH'),
      ]);

      const state = await service.toStatePayload(row);

      expect(state.openWindow?.round).toBe(1);
      expect(state.openWindow?.actorUserId).toBe(ME);
      expect(state.openWindow?.actionSkillCode).toBe('POWER_STRIKE');
      expect(state.openWindow?.deadline).toBe(deadline.toISOString());
      expect(state.openWindow?.applicableSkillCodes).toEqual(['PARRY']);
      expect(state.openWindow?.remainingMs).toBeGreaterThan(0);
      expect(state.openWindow?.remainingMs).toBeLessThanOrEqual(9_000);
      expect(buildSkillFindMany).toHaveBeenCalledWith({
        where: { buildId: `build-${RIVAL}` },
        include: { skill: true },
      });
    });

    it('shows no open window once the deadline has already passed', async () => {
      // `toStatePayload` renders whatever `row` says; `settleOverdue` is the
      // one place that acts on an overdue deadline, never this method.
      const row = acceptedRow({
        status: BattleStatus.IN_PROGRESS,
        activeUserId: ME,
        pendingActionSkillCode: 'POWER_STRIKE',
        reactionDeadline: new Date(Date.now() - 1_000),
      });
      skillFindUniqueOrThrow.mockResolvedValue({
        requiredAttribute: 'STRENGTH',
      });
      buildSkillFindMany.mockResolvedValue([]);

      const state = await service.toStatePayload(row);

      expect(state.openWindow?.remainingMs).toBe(0);
    });

    it('includes opponentLeft when a disconnect is recorded', async () => {
      const deadline = new Date(Date.now() + 60_000);
      const row = acceptedRow({
        status: BattleStatus.IN_PROGRESS,
        disconnectedUserId: RIVAL,
        disconnectDeadline: deadline,
      });

      const state = await service.toStatePayload(row);

      expect(state.opponentLeft).toEqual({
        userId: RIVAL,
        deadline: deadline.toISOString(),
      });
    });
  });

  describe('recordDisconnect', () => {
    it("starts a 2-minute abandonment deadline for a participant's disconnect", async () => {
      findUnique.mockResolvedValue({
        status: BattleStatus.IN_PROGRESS,
        challengerId: ME,
        opponentId: RIVAL,
      });
      update.mockResolvedValue(undefined);
      const now = Date.now();

      const deadline = await service.recordDisconnect(BATTLE_ID, RIVAL);

      expect(deadline).not.toBeNull();
      expect((deadline as Date).getTime()).toBeGreaterThanOrEqual(
        now + 119_000,
      );
      expect(update).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: {
          disconnectedUserId: RIVAL,
          disconnectDeadline: expect.any(Date) as Date,
        },
      });
    });

    it('does nothing for a battle that is not IN_PROGRESS', async () => {
      findUnique.mockResolvedValue({
        status: BattleStatus.FINISHED,
        challengerId: ME,
        opponentId: RIVAL,
      });

      await expect(
        service.recordDisconnect(BATTLE_ID, RIVAL),
      ).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('does nothing for a caller who is not a participant', async () => {
      findUnique.mockResolvedValue({
        status: BattleStatus.IN_PROGRESS,
        challengerId: ME,
        opponentId: RIVAL,
      });

      await expect(
        service.recordDisconnect(BATTLE_ID, STRANGER),
      ).resolves.toBeNull();
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('admitJoin — clearing a disconnect on rejoin', () => {
    it("clears the rejoining participant's own disconnect state without touching an open window", async () => {
      findForParticipant.mockResolvedValue(
        acceptedRow({
          status: BattleStatus.IN_PROGRESS,
          currentRound: 1,
          activeUserId: RIVAL,
          disconnectedUserId: ME,
          disconnectDeadline: new Date(Date.now() + 60_000),
          reactionDeadline: new Date(Date.now() + 10_000),
          pendingActionSkillCode: 'POWER_STRIKE',
        }),
      );
      update.mockResolvedValue(undefined);

      const result = await service.admitJoin(BATTLE_ID, ME);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('expected admission');
      }
      expect(result.row.disconnectedUserId).toBeNull();
      expect(result.row.disconnectDeadline).toBeNull();
      expect(update).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: { disconnectedUserId: null, disconnectDeadline: null },
      });
    });

    it("leaves the other participant's disconnect state alone", async () => {
      findForParticipant.mockResolvedValue(
        acceptedRow({
          status: BattleStatus.IN_PROGRESS,
          currentRound: 1,
          activeUserId: ME,
          disconnectedUserId: RIVAL,
          disconnectDeadline: new Date(Date.now() + 60_000),
        }),
      );

      const result = await service.admitJoin(BATTLE_ID, ME);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error('expected admission');
      }
      expect(result.row.disconnectedUserId).toBe(RIVAL);
      expect(update).not.toHaveBeenCalled();
    });
  });
});

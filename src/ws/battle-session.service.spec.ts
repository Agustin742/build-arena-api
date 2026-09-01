import { BattleStatus } from '../generated/prisma/enums';
import type { BattleSessionRow } from '../battle/battle.mapper';
import type { BattleService } from '../battle/battle.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SessionContext } from './rules/message-checks';
import { BattleSessionService } from './battle-session.service';

const ME = '11111111-0000-4000-8000-000000000001';
const RIVAL = '22222222-0000-4000-8000-000000000002';
const STRANGER = '99999999-0000-4000-8000-000000000009';
const BATTLE_ID = '33333333-0000-4000-8000-000000000003';

/** One combatant row shaped exactly like `findForParticipant`'s include. */
const combatant = (userId: string, initiative: number) => ({
  id: `combatant-${userId}`,
  userId,
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
});

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
  const prisma = { battle: { update } } as unknown as PrismaService;
  const service = new BattleSessionService(battleService, prisma);

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

  describe('toStatePayload', () => {
    it('assembles battleId, status, currentRound, activeUserId and combatants', () => {
      const row = acceptedRow({
        status: BattleStatus.IN_PROGRESS,
        currentRound: 1,
        activeUserId: ME,
      });

      expect(service.toStatePayload(row)).toEqual({
        battleId: BATTLE_ID,
        status: BattleStatus.IN_PROGRESS,
        currentRound: 1,
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
      });
    });
  });
});

import 'dotenv/config';

import { Prisma } from '../generated/prisma/client';
import { BattleStatus, ConditionType } from '../generated/prisma/enums';
import { SequenceRandomSource } from '../combat';
import { PrismaService } from '../prisma/prisma.service';
import { TurnResolutionService } from './turn-resolution.service';

const BATTLE_ID = '33333333-0000-4000-8000-000000000003';
const ACTOR_ID = 'combatant-actor';
const DEFENDER_ID = 'combatant-defender';
const ACTOR_USER_ID = '11111111-0000-4000-8000-000000000001';
const DEFENDER_USER_ID = '22222222-0000-4000-8000-000000000002';
const ROUND = 1;
const UNIQUE_VIOLATION = 'P2002';

/** A low-armor-class, no-damage-dice reaction: hits deterministically and never rolls a counter. */
const dodge = {
  id: 'skill-dodge',
  code: 'DODGE',
  name: 'Dodge',
  description: 'd',
  type: 'REACTION',
  cost: 1,
  requiredAttribute: 'DEXTERITY',
  requiredValue: 0,
  damageDice: null,
  appliesCondition: null,
  conditionRounds: null,
};

/** No `appliesCondition`, `1d8` damage — the plain "part A" case with nothing extra to persist. */
const powerStrike = {
  id: 'skill-power-strike',
  code: 'POWER_STRIKE',
  name: 'Power Strike',
  description: 'd',
  type: 'ACTION',
  cost: 1,
  requiredAttribute: 'STRENGTH',
  requiredValue: 0,
  damageDice: '1d8',
  appliesCondition: null,
  conditionRounds: null,
};

/** Poisons the defender on a hit — used to exercise ActiveCondition persistence (part B). */
const venomBolt = {
  ...powerStrike,
  id: 'skill-venom-bolt',
  code: 'VENOM_BOLT',
  appliesCondition: ConditionType.POISONED,
  conditionRounds: 3,
};

const combatantRow = (
  id: string,
  userId: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  battleId: BATTLE_ID,
  userId,
  buildId: null,
  strength: 15,
  magic: 10,
  dexterity: 10,
  constitution: 10,
  // A low armor class so a scripted "kept 15" attack always hits.
  armorClass: 5,
  maxHp: 30,
  currentHp: 30,
  initiative: 10,
  reactionAvailable: true,
  conditions: [],
  ...overrides,
});

describe('TurnResolutionService', () => {
  const updateMany = jest.fn();
  const findUniqueOrThrowBattle = jest.fn();
  const findUniqueOrThrowSkill = jest.fn();
  const createManyTurn = jest.fn();
  const updateCombatant = jest.fn();
  const upsertCondition = jest.fn();
  const updateCondition = jest.fn();
  const deleteCondition = jest.fn();
  const updateBattle = jest.fn();

  const tx = {
    battle: {
      updateMany,
      findUniqueOrThrow: findUniqueOrThrowBattle,
      update: updateBattle,
    },
    skill: { findUniqueOrThrow: findUniqueOrThrowSkill },
    battleTurn: { createMany: createManyTurn },
    battleCombatant: { update: updateCombatant },
    activeCondition: {
      upsert: upsertCondition,
      update: updateCondition,
      delete: deleteCondition,
    },
  };

  const $transaction = jest.fn(
    (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const findManyTurn = jest.fn();
  const findManyCombatant = jest.fn();

  const prisma = {
    $transaction,
    battleTurn: { findMany: findManyTurn },
    battleCombatant: { findMany: findManyCombatant },
  } as unknown as PrismaService;

  // Fresh per test: the script is shared by every draw a single `resolve()`
  // call makes, and each test calls it at most once — d20 kept 15, then the
  // 1d8 damage roll, kept 5.
  let service: TurnResolutionService;

  beforeEach(() => {
    jest.clearAllMocks();
    updateBattle.mockResolvedValue(undefined);
    updateCombatant.mockResolvedValue(undefined);
    service = new TurnResolutionService(
      prisma,
      new SequenceRandomSource([15, 5]),
    );
  });

  const armBattle = (overrides: Record<string, unknown> = {}) => {
    updateMany.mockResolvedValue({ count: 1 });
    findUniqueOrThrowBattle.mockResolvedValue({
      activeUserId: ACTOR_USER_ID,
      status: 'IN_PROGRESS',
      challengerId: ACTOR_USER_ID,
      opponentId: DEFENDER_USER_ID,
      combatants: [
        combatantRow(ACTOR_ID, ACTOR_USER_ID),
        combatantRow(DEFENDER_ID, DEFENDER_USER_ID),
      ],
      ...overrides,
    });
  };

  describe('the atomic claim', () => {
    it('resolves through the engine when the claim wins (count === 1)', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockResolvedValue({ count: 2 });

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        null,
      );

      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: BATTLE_ID,
          currentRound: ROUND,
          reactionDeadline: { not: null },
        },
        data: { pendingActionSkillCode: null, reactionDeadline: null },
      });
      expect(result.turns).toHaveLength(2);
      expect(result.turns[0]).toMatchObject({
        round: ROUND,
        sequence: 1,
        actorId: ACTOR_ID,
        skillCode: 'POWER_STRIKE',
      });
    });

    it('never calls the engine when the claim loses (count === 0), re-reading the persisted result instead', async () => {
      updateMany.mockResolvedValue({ count: 0 });
      findManyTurn.mockResolvedValue([
        {
          battleId: BATTLE_ID,
          round: ROUND,
          sequence: 1,
          actorId: ACTOR_ID,
          kind: 'ACTION',
          skillCode: 'POWER_STRIKE',
          attackRoll: 15,
          targetValue: 5,
          hit: true,
          critical: false,
          damage: 5,
        },
      ]);
      findManyCombatant.mockResolvedValue([
        combatantRow(ACTOR_ID, ACTOR_USER_ID),
        combatantRow(DEFENDER_ID, DEFENDER_USER_ID, { currentHp: 25 }),
      ]);

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        null,
      );

      // The loser never reaches the skill catalog lookup, let alone the engine.
      expect(findUniqueOrThrowSkill).not.toHaveBeenCalled();
      expect(createManyTurn).not.toHaveBeenCalled();
      expect(result.turns).toHaveLength(1);
      expect(result.defender.currentHp).toBe(25);
    });
  });

  describe('engine invocation', () => {
    it('passes the declared reaction to the engine when one was declared', async () => {
      armBattle();
      findUniqueOrThrowSkill
        .mockResolvedValueOnce(powerStrike)
        .mockResolvedValueOnce(dodge);
      createManyTurn.mockResolvedValue({ count: 2 });

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        'DODGE',
      );

      expect(result.turns[1]).toMatchObject({
        sequence: 2,
        kind: 'REACTION',
        skillCode: 'DODGE',
      });
    });

    it('passes reaction: null to the engine when none was declared', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockResolvedValue({ count: 2 });

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        null,
      );

      expect(result.turns[1]).toMatchObject({
        sequence: 2,
        kind: 'REACTION',
        skillCode: null,
      });
    });
  });

  it('never passes skipDuplicates to the BattleTurn createMany', async () => {
    armBattle();
    findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
    createManyTurn.mockResolvedValue({ count: 2 });

    await service.resolve(BATTLE_ID, ROUND, 'POWER_STRIKE', null);

    expect(createManyTurn).toHaveBeenCalledWith(
      expect.not.objectContaining({ skipDuplicates: true }),
    );
  });

  describe('persistence (part B)', () => {
    it('updates both combatants currentHp and clears reactionAvailable only when the reaction was actually spent', async () => {
      armBattle();
      findUniqueOrThrowSkill
        .mockResolvedValueOnce(powerStrike)
        .mockResolvedValueOnce(dodge);
      createManyTurn.mockResolvedValue({ count: 2 });

      await service.resolve(BATTLE_ID, ROUND, 'POWER_STRIKE', 'DODGE');

      expect(updateCombatant).toHaveBeenCalledWith({
        where: { id: ACTOR_ID },
        data: { currentHp: 30 },
      });
      expect(updateCombatant).toHaveBeenCalledWith({
        where: { id: DEFENDER_ID },
        data: {
          currentHp: expect.any(Number) as number,
          reactionAvailable: false,
        },
      });
    });

    it('preserves reactionAvailable when no reaction was declared', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockResolvedValue({ count: 2 });

      await service.resolve(BATTLE_ID, ROUND, 'POWER_STRIKE', null);

      expect(updateCombatant).toHaveBeenCalledWith({
        where: { id: DEFENDER_ID },
        data: {
          currentHp: expect.any(Number) as number,
          reactionAvailable: true,
        },
      });
    });

    it('upserts an ActiveCondition row when the action applies one on a hit', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(venomBolt);
      createManyTurn.mockResolvedValue({ count: 2 });

      await service.resolve(BATTLE_ID, ROUND, 'VENOM_BOLT', null);

      expect(upsertCondition).toHaveBeenCalledWith({
        where: {
          combatantId_type: {
            combatantId: DEFENDER_ID,
            type: ConditionType.POISONED,
          },
        },
        create: {
          combatantId: DEFENDER_ID,
          type: ConditionType.POISONED,
          roundsRemaining: 3,
        },
        update: { roundsRemaining: 3 },
      });
    });

    it('advances currentRound and flips activeUserId to the defender when nobody is defeated', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockResolvedValue({ count: 2 });

      await service.resolve(BATTLE_ID, ROUND, 'POWER_STRIKE', null);

      expect(updateBattle).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: { currentRound: ROUND + 1, activeUserId: DEFENDER_USER_ID },
      });
    });

    it('closes the battle with DEFEAT when the defender is reduced to 0 HP', async () => {
      armBattle();
      findUniqueOrThrowBattle.mockResolvedValue({
        activeUserId: ACTOR_USER_ID,
        status: 'IN_PROGRESS',
        challengerId: ACTOR_USER_ID,
        opponentId: DEFENDER_USER_ID,
        combatants: [
          combatantRow(ACTOR_ID, ACTOR_USER_ID),
          combatantRow(DEFENDER_ID, DEFENDER_USER_ID, { currentHp: 2 }),
        ],
      });
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockResolvedValue({ count: 2 });

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        null,
      );

      expect(result.defeatedId).toBe(DEFENDER_ID);
      expect(updateBattle).toHaveBeenCalledWith({
        where: { id: BATTLE_ID },
        data: {
          status: 'FINISHED',
          winnerId: ACTOR_USER_ID,
          endedAt: expect.any(Date) as Date,
        },
      });
    });
  });

  describe('idempotent re-emit on P2002 (part D)', () => {
    it('re-reads the persisted rows and never re-runs the engine on a unique violation', async () => {
      armBattle();
      findUniqueOrThrowSkill.mockResolvedValueOnce(powerStrike);
      createManyTurn.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: UNIQUE_VIOLATION,
          clientVersion: 'test',
        }),
      );
      findManyTurn.mockResolvedValue([
        {
          battleId: BATTLE_ID,
          round: ROUND,
          sequence: 1,
          actorId: ACTOR_ID,
          kind: 'ACTION',
          skillCode: 'POWER_STRIKE',
          attackRoll: 15,
          targetValue: 5,
          hit: true,
          critical: false,
          damage: 5,
        },
        {
          battleId: BATTLE_ID,
          round: ROUND,
          sequence: 2,
          actorId: DEFENDER_ID,
          kind: 'REACTION',
          skillCode: null,
          attackRoll: null,
          targetValue: null,
          hit: null,
          critical: false,
          damage: 0,
        },
      ]);
      findManyCombatant.mockResolvedValue([
        combatantRow(ACTOR_ID, ACTOR_USER_ID),
        combatantRow(DEFENDER_ID, DEFENDER_USER_ID, { currentHp: 25 }),
      ]);

      const result = await service.resolve(
        BATTLE_ID,
        ROUND,
        'POWER_STRIKE',
        null,
      );

      expect(result.turns).toHaveLength(2);
      expect(result.defender.currentHp).toBe(25);
      // The whole point: this must not throw, and it must not roll fresh dice.
      expect(findManyTurn).toHaveBeenCalledWith({
        where: { battleId: BATTLE_ID, round: ROUND },
        orderBy: { sequence: 'asc' },
      });
    });
  });
});

/**
 * Part C — the design's flagged unvalidated assumption: that Prisma's
 * `updateMany` re-evaluates its WHERE after the row lock releases under
 * READ COMMITTED. Real database, real connections, real concurrency — no
 * mocks. Two `resolve()` calls race for the SAME open window; exactly one
 * must reach the engine and persist, and the loser must observe the
 * winner's own result.
 */
describe('TurnResolutionService — concurrent resolve() (part C, real database)', () => {
  const stamp = Date.now().toString(36);
  let prisma: PrismaService;
  let battleId: string;
  let actorUserId: string;
  let defenderUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const actorUser = await prisma.user.create({
      data: {
        email: `race-a-${stamp}@buildarena.dev`,
        username: `race_a_${stamp}`,
        passwordHash: 'not-a-real-hash',
      },
    });
    const defenderUser = await prisma.user.create({
      data: {
        email: `race-b-${stamp}@buildarena.dev`,
        username: `race_b_${stamp}`,
        passwordHash: 'not-a-real-hash',
      },
    });
    actorUserId = actorUser.id;
    defenderUserId = defenderUser.id;

    const battle = await prisma.battle.create({
      data: {
        challengerId: actorUserId,
        opponentId: defenderUserId,
        status: BattleStatus.IN_PROGRESS,
        currentRound: 1,
        activeUserId: actorUserId,
        pendingActionSkillCode: 'POWER_STRIKE',
        // A deadline still in the future: an open window, exactly what a
        // real `battle:reaction` (or its lazy/timer expiry) would race on.
        reactionDeadline: new Date(Date.now() + 60_000),
      },
    });
    battleId = battle.id;

    await prisma.battleCombatant.createMany({
      data: [
        {
          battleId,
          userId: actorUserId,
          strength: 15,
          magic: 10,
          dexterity: 10,
          constitution: 10,
          armorClass: 5,
          maxHp: 30,
          currentHp: 30,
          initiative: 10,
          reactionAvailable: true,
        },
        {
          battleId,
          userId: defenderUserId,
          strength: 10,
          magic: 10,
          dexterity: 10,
          constitution: 10,
          armorClass: 5,
          maxHp: 30,
          currentHp: 30,
          initiative: 5,
          reactionAvailable: true,
        },
      ],
    });
  }, 30_000);

  afterAll(async () => {
    await prisma.battle.deleteMany({ where: { id: battleId } });
    await prisma.user.deleteMany({
      where: { id: { in: [actorUserId, defenderUserId] } },
    });
    await prisma.$disconnect();
  }, 30_000);

  it('two concurrent resolve() calls for the same window produce exactly one resolution', async () => {
    // Ample margin, not exactness: a real race that reaches the engine
    // twice would exhaust this and fail loudly rather than silently
    // producing a second, different result.
    const resolver = new TurnResolutionService(
      prisma,
      new SequenceRandomSource([15, 5, 15, 5, 15, 5, 15, 5]),
    );

    const [first, second] = await Promise.all([
      resolver.resolve(battleId, 1, 'POWER_STRIKE', null),
      resolver.resolve(battleId, 1, 'POWER_STRIKE', null),
    ]);

    const persisted = await prisma.battleTurn.findMany({
      where: { battleId, round: 1 },
      orderBy: { sequence: 'asc' },
    });

    // Exactly one pair of rows, never two pairs and never a partial write.
    expect(persisted).toHaveLength(2);
    // Both callers observe the SAME result — the loser re-read it, it did
    // not compute a different one.
    expect(first.turns).toEqual(second.turns);
    expect(first.defender.currentHp).toBe(second.defender.currentHp);
    expect(first.defeatedId).toBe(second.defeatedId);
  }, 30_000);
});

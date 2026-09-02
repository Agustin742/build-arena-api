import 'dotenv/config';

import { BattleStatus } from '../src/generated/prisma/enums';
import { SequenceRandomSource } from '../src/combat';
import { PrismaService } from '../src/prisma/prisma.service';
import { RatingService } from '../src/rating/rating.service';
import { TurnResolutionService } from '../src/ws/turn-resolution.service';

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
      new RatingService(),
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

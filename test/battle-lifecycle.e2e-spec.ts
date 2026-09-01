import 'dotenv/config';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const NETWORK_TIMEOUT = 60_000;
const stamp = Date.now();

/** Usernames cap at 20 characters, so the run is tagged with a short suffix. */
const tag = stamp.toString(36);

const credentialsFor = (role: string) => ({
  email: `${role}_${stamp}@buildarena.dev`,
  username: `${role}_${tag}`,
  password: 'a-long-enough-password',
});

const challenger = credentialsFor('chl');
const opponent = credentialsFor('opp');
const stranger = credentialsFor('str');

const buildFor = (name: string) => ({
  name: `${name} ${stamp}`,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
});

type BattleView = { id: string; status: string; ranked: boolean };

describe('Battle lifecycle against a real database (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let challengerToken: string;
  let opponentToken: string;
  let strangerToken: string;
  let challengerBuildId: string;
  let opponentBuildId: string;
  let battleId: string;

  const emails = [challenger.email, opponent.email, stranger.email];

  const register = async (credentials: typeof challenger): Promise<string> => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);

    return (response.body as { accessToken: string }).accessToken;
  };

  const createBuild = async (token: string, name: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .post('/builds')
      .set('Authorization', `Bearer ${token}`)
      .send(buildFor(name))
      .expect(201);

    return (response.body as { id: string }).id;
  };

  const challenge = async (opponentId: string): Promise<BattleView> => {
    const response = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId, buildId: challengerBuildId })
      .expect(201);

    return response.body as BattleView;
  };

  const opponentId = async (): Promise<string> => {
    const player = await prisma.user.findUniqueOrThrow({
      where: { email: opponent.email },
      select: { id: true },
    });

    return player.id;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    prisma = app.get(PrismaService);
    await app.init();

    challengerToken = await register(challenger);
    opponentToken = await register(opponent);
    strangerToken = await register(stranger);

    challengerBuildId = await createBuild(challengerToken, 'Challenger');
    opponentBuildId = await createBuild(opponentToken, 'Opponent');
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    const players = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = players.map((player) => player.id);

    // Battles hold their participants with ON DELETE RESTRICT, so they go
    // first. Their combatants cascade with them.
    await prisma.battle.deleteMany({
      where: {
        OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'opens a ranked challenge between two players who are not friends',
    async () => {
      const battle = await challenge(await opponentId());
      battleId = battle.id;

      expect(battle.status).toBe('PENDING');
      expect(battle.ranked).toBe(true);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a challenge to yourself',
    async () => {
      const me = await prisma.user.findUniqueOrThrow({
        where: { email: challenger.email },
        select: { id: true },
      });

      const response = await request(app.getHttpServer())
        .post('/battles')
        .set('Authorization', `Bearer ${challengerToken}`)
        .send({ opponentId: me.id, buildId: challengerBuildId })
        .expect(400);

      const body = response.body as { violations: { rule: string }[] };

      expect(body.violations.map((entry) => entry.rule)).toContain(
        'SELF_CHALLENGE',
      );
    },
    NETWORK_TIMEOUT,
  );

  it(
    'does not let the challenger accept their own challenge',
    async () => {
      // The trap of the phase, end to end. The battle IS pending and the
      // caller IS in it: only the entitlement check stands between the
      // challenger and picking when the fight starts.
      await request(app.getHttpServer())
        .patch(`/battles/${battleId}/accept`)
        .set('Authorization', `Bearer ${challengerToken}`)
        .send({ buildId: challengerBuildId })
        .expect(403);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'answers 404 to a player outside the battle, even though it exists',
    async () => {
      await request(app.getHttpServer())
        .get(`/battles/${battleId}`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .expect(404);

      await request(app.getHttpServer())
        .patch(`/battles/${battleId}/accept`)
        .set('Authorization', `Bearer ${strangerToken}`)
        .send({ buildId: opponentBuildId })
        .expect(404);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'does not let the challenged player cancel a challenge they received',
    async () => {
      await request(app.getHttpServer())
        .patch(`/battles/${battleId}/cancel`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .expect(403);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'lets the challenged player accept, and freezes both combatants',
    async () => {
      const response = await request(app.getHttpServer())
        .patch(`/battles/${battleId}/accept`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({ buildId: opponentBuildId })
        .expect(200);

      expect((response.body as BattleView).status).toBe('ACCEPTED');

      const combatants = await prisma.battleCombatant.findMany({
        where: { battleId },
      });

      expect(combatants).toHaveLength(2);
      for (const combatant of combatants) {
        expect(combatant.strength).toBe(15);
        expect(combatant.armorClass).toBe(11);
        expect(combatant.maxHp).toBe(30);
        expect(combatant.currentHp).toBe(combatant.maxHp);
        expect(combatant.initiative).toBeGreaterThanOrEqual(2);
      }
    },
    NETWORK_TIMEOUT,
  );

  it(
    'keeps the frozen stats when the build behind them is deleted',
    async () => {
      // The whole reason the combatant is a copy: a fight cannot change rules
      // halfway through, not even by deleting the build it came from. The
      // reference is dropped, the numbers stay.
      await request(app.getHttpServer())
        .delete(`/builds/${opponentBuildId}`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .expect(204);

      const combatants = await prisma.battleCombatant.findMany({
        where: { battleId },
        orderBy: { armorClass: 'asc' },
      });

      expect(combatants.map((combatant) => combatant.strength)).toEqual([
        15, 15,
      ]);
      expect(
        combatants.filter((combatant) => combatant.buildId === null),
      ).toHaveLength(1);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses every pending-only move once the battle is accepted',
    async () => {
      await request(app.getHttpServer())
        .patch(`/battles/${battleId}/accept`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({ buildId: opponentBuildId })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/battles/${battleId}/cancel`)
        .set('Authorization', `Bearer ${challengerToken}`)
        .expect(403);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'lets the challenger take back a challenge that is still pending',
    async () => {
      const battle = await challenge(await opponentId());

      const response = await request(app.getHttpServer())
        .patch(`/battles/${battle.id}/cancel`)
        .set('Authorization', `Bearer ${challengerToken}`)
        .expect(200);

      expect((response.body as BattleView).status).toBe('CANCELLED');
    },
    NETWORK_TIMEOUT,
  );

  it(
    'lets the challenged player reject a challenge',
    async () => {
      const battle = await challenge(await opponentId());

      const response = await request(app.getHttpServer())
        .patch(`/battles/${battle.id}/reject`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .expect(200);

      expect((response.body as BattleView).status).toBe('REJECTED');
    },
    NETWORK_TIMEOUT,
  );

  it(
    'does not rank a battle between two accepted friends',
    async () => {
      const rival = await opponentId();

      const requested = await request(app.getHttpServer())
        .post('/friendships')
        .set('Authorization', `Bearer ${challengerToken}`)
        .send({ addresseeId: rival })
        .expect(201);

      const friendshipId = (requested.body as { id: string }).id;

      // Same trap, other resource: the requester cannot answer their own
      // request either.
      await request(app.getHttpServer())
        .patch(`/friendships/${friendshipId}/accept`)
        .set('Authorization', `Bearer ${challengerToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/friendships/${friendshipId}/accept`)
        .set('Authorization', `Bearer ${opponentToken}`)
        .expect(200);

      const battle = await challenge(rival);

      expect(battle.ranked).toBe(false);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a second friend request in either direction',
    async () => {
      const me = await prisma.user.findUniqueOrThrow({
        where: { email: challenger.email },
        select: { id: true },
      });

      const response = await request(app.getHttpServer())
        .post('/friendships')
        .set('Authorization', `Bearer ${opponentToken}`)
        .send({ addresseeId: me.id })
        .expect(400);

      const body = response.body as { violations: { rule: string }[] };

      expect(body.violations.map((entry) => entry.rule)).toContain(
        'DUPLICATE_REQUEST',
      );
    },
    NETWORK_TIMEOUT,
  );
});

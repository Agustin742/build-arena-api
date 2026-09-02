import 'dotenv/config';

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { io as ioClient } from 'socket.io-client';
import type { Socket as ClientSocket } from 'socket.io-client';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const NETWORK_TIMEOUT = 60_000;
const stamp = Date.now();
const tag = stamp.toString(36);

/** The kit both players are frozen with. Costs 17 of the 18-point budget. */
const FROZEN_CODES = ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'];

/**
 * The kit both players switch to AFTER the freeze. Same two reactions, both
 * actions replaced, and 17 points again so the edit is legal on its own.
 */
const EDITED_CODES = ['RECKLESS_BLOW', 'VENOM_BOLT', 'PARRY', 'DODGE'];

const credentialsFor = (role: string) => ({
  email: `${role}_${stamp}@buildarena.dev`,
  username: `${role}_${tag}`,
  password: 'a-long-enough-password',
});

const challenger = credentialsFor('kchl');
const opponent = credentialsFor('kopp');

const buildFor = (name: string, skillCodes: string[]) => ({
  name: `${name} ${stamp}`,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes,
});

type CombatantView = { userId: string; skillCodes: string[] };

type BattleStatePayload = {
  battleId: string;
  status: string;
  currentRound: number;
  activeUserId: string | null;
  combatants: CombatantView[];
};

type BattleErrorPayload = { code: string; message: string; event?: string };

type ReactionWindowPayload = { actionSkillCode: string };

/**
 * What phase 5 always claimed and phase 8 finally made true: accepting a
 * challenge freezes BOTH sides, kit included. Everything here runs against a
 * real database, because the whole point is that a write to `Build` does not
 * reach a battle already under way.
 */
describe('Frozen combatant kit (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let sockets: ClientSocket[] = [];
  let battleId: string;
  let challengerToken: string;
  let opponentToken: string;
  let challengerBuildId: string;
  let opponentBuildId: string;
  let challengerId: string;
  let opponentId: string;

  const emails = [challenger.email, opponent.email];

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
      .send(buildFor(name, FROZEN_CODES))
      .expect(201);

    return (response.body as { id: string }).id;
  };

  const connect = (token: string): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
      const client = ioClient(url, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token },
      });
      sockets.push(client);
      client.on('connect', () => resolve(client));
      client.on('connect_error', reject);
    });

  const join = (client: ClientSocket): Promise<BattleStatePayload> =>
    new Promise((resolve, reject) => {
      client.once('battle:state', resolve);
      client.once('battle:error', (payload: BattleErrorPayload) =>
        reject(new Error(`join refused: ${payload.code}`)),
      );
      client.emit('battle:join', { battleId });
    });

  /**
   * Declares an action and resolves with whichever answer comes back. The
   * window is emitted with `socket.to(room)`, which excludes the sender, so
   * the defender's socket is where it has to be awaited.
   */
  const declare = (
    actor: ClientSocket,
    defender: ClientSocket,
    skillCode: string,
  ): Promise<
    | { event: 'window'; payload: ReactionWindowPayload }
    | { event: 'error'; payload: BattleErrorPayload }
  > =>
    new Promise((resolve) => {
      defender.once(
        'battle:reaction_window',
        (payload: ReactionWindowPayload) =>
          resolve({ event: 'window', payload }),
      );
      actor.once('battle:error', (payload: BattleErrorPayload) =>
        resolve({ event: 'error', payload }),
      );
      actor.emit('battle:action', { battleId, skillCode });
    });

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
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;

    challengerToken = await register(challenger);
    opponentToken = await register(opponent);

    challengerBuildId = await createBuild(challengerToken, 'Challenger');
    opponentBuildId = await createBuild(opponentToken, 'Opponent');

    const players = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    challengerId = players.find((p) => p.email === challenger.email)!.id;
    opponentId = players.find((p) => p.email === opponent.email)!.id;

    const challengeResponse = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId, buildId: challengerBuildId })
      .expect(201);

    battleId = (challengeResponse.body as { id: string }).id;

    await request(app.getHttpServer())
      .patch(`/battles/${battleId}/accept`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({ buildId: opponentBuildId })
      .expect(200);
  }, NETWORK_TIMEOUT);

  afterEach(() => {
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];
  });

  afterAll(async () => {
    // Closing a socket fires `handleDisconnect`, which writes the
    // abandonment deadline. Let those land before the rows go away.
    await new Promise((settle) => setTimeout(settle, 1_000));

    await prisma.battle.deleteMany({
      where: {
        OR: [
          { challengerId: { in: [challengerId, opponentId] } },
          { opponentId: { in: [challengerId, opponentId] } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'publishes each frozen kit in battle:state, and keeps it after both builds are rewritten',
    async () => {
      const first = await connect(challengerToken);
      const before = await join(first);

      // Hueco 2: the client can read what it may declare straight off the
      // state, with no call to /builds at all.
      for (const combatant of before.combatants) {
        expect(combatant.skillCodes.slice().sort()).toEqual(
          FROZEN_CODES.slice().sort(),
        );
      }

      // Both players rewrite their kit while the fight is under way. Each
      // edit is legal on its own — that is exactly why it used to be
      // dangerous.
      for (const [token, buildId] of [
        [challengerToken, challengerBuildId],
        [opponentToken, opponentBuildId],
      ]) {
        await request(app.getHttpServer())
          .patch(`/builds/${buildId}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ skillCodes: EDITED_CODES })
          .expect(200);
      }

      // Hueco 1: a reconnect reads the battle back from the database, and
      // the database still holds the kit the freeze wrote.
      const reconnected = await connect(challengerToken);
      const after = await join(reconnected);

      for (const combatant of after.combatants) {
        expect(combatant.skillCodes.slice().sort()).toEqual(
          FROZEN_CODES.slice().sort(),
        );
      }
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a skill the player added after the freeze, and still admits one they removed',
    async () => {
      const challengerSocket = await connect(challengerToken);
      const opponentSocket = await connect(opponentToken);
      const state = await join(challengerSocket);
      await join(opponentSocket);

      const challengerIsActive = state.activeUserId === challengerId;
      const actor = challengerIsActive ? challengerSocket : opponentSocket;
      const defender = challengerIsActive ? opponentSocket : challengerSocket;

      // RECKLESS_BLOW is in the build right now and was never frozen.
      const added = await declare(actor, defender, 'RECKLESS_BLOW');

      expect(added).toEqual({
        event: 'error',
        payload: {
          code: 'SKILL_NOT_IN_KIT',
          message: 'That skill is not part of your kit for this battle',
          event: 'battle:action',
        },
      });

      // POWER_STRIKE is the mirror image: gone from the build, still frozen
      // into this fight, so it is the one that works.
      const frozen = await declare(actor, defender, 'POWER_STRIKE');

      expect(frozen.event).toBe('window');
      expect((frozen.payload as ReactionWindowPayload).actionSkillCode).toBe(
        'POWER_STRIKE',
      );

      // Close the window by declining, so the 15-second comfort timer does
      // not fire into a database this suite is about to tear down.
      await new Promise<void>((resolve) => {
        challengerSocket.once('battle:turn_resolved', () => resolve());
        defender.emit('battle:reaction', { battleId, skillCode: null });
      });
    },
    NETWORK_TIMEOUT,
  );
});

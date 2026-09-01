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

/** Usernames cap at 20 characters, so the run is tagged with a short suffix. */
const tag = stamp.toString(36);

const credentialsFor = (role: string) => ({
  email: `${role}_${stamp}@buildarena.dev`,
  username: `${role}_${tag}`,
  password: 'a-long-enough-password',
});

const challenger = credentialsFor('rchl');
const opponent = credentialsFor('ropp');
const stranger = credentialsFor('rstr');

const buildFor = (name: string) => ({
  name: `${name} ${stamp}`,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
});

type BattleView = { id: string; status: string };

type BattleStatePayload = {
  battleId: string;
  status: string;
  currentRound: number;
  activeUserId: string | null;
  combatants: unknown[];
};

type BattleErrorPayload = { code: string; message: string; event?: string };

describe('Battle realtime handshake and room admission (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let sockets: ClientSocket[] = [];
  let battleId: string;
  let challengerToken: string;
  let strangerToken: string;

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

    // The only e2e spec that needs a real listening port: supertest works
    // in-process for REST, but a socket.io-client connection needs an
    // actual socket to dial.
    await app.listen(0);

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    // Built from the raw address, not `app.getUrl()`, which can return an
    // `[::1]` form socket.io-client does not always dial cleanly.
    url = `http://127.0.0.1:${address.port}`;

    challengerToken = await register(challenger);
    const opponentToken = await register(opponent);
    strangerToken = await register(stranger);

    const challengerBuildId = await createBuild(challengerToken, 'Challenger');
    const opponentBuildId = await createBuild(opponentToken, 'Opponent');

    const opponentUser = await prisma.user.findUniqueOrThrow({
      where: { email: opponent.email },
      select: { id: true },
    });

    const challengeResponse = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId: opponentUser.id, buildId: challengerBuildId })
      .expect(201);

    battleId = (challengeResponse.body as BattleView).id;

    await request(app.getHttpServer())
      .patch(`/battles/${battleId}/accept`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({ buildId: opponentBuildId })
      .expect(200);
  }, NETWORK_TIMEOUT);

  /** An authenticated client, resolved once the handshake succeeds. */
  const connectAuthenticated = (token: string): Promise<ClientSocket> =>
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

  /** Emits `battle:join` and resolves whichever of the two answers arrives. */
  const join = (
    client: ClientSocket,
    id: string,
  ): Promise<
    { event: 'state'; payload: BattleStatePayload } | { event: 'error'; payload: BattleErrorPayload }
  > =>
    new Promise((resolve) => {
      client.once('battle:state', (payload: BattleStatePayload) =>
        resolve({ event: 'state', payload }),
      );
      client.once('battle:error', (payload: BattleErrorPayload) =>
        resolve({ event: 'error', payload }),
      );
      client.emit('battle:join', { battleId: id });
    });

  afterEach(() => {
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];
  });

  afterAll(async () => {
    const players = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = players.map((player) => player.id);

    // Battles hold their participants with ON DELETE RESTRICT, so they go
    // first, exactly like the REST lifecycle e2e teardown.
    await prisma.battle.deleteMany({
      where: {
        OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'never joins a connection that carries no handshake token',
    async () => {
      const client = ioClient(url, {
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(client);

      const outcome = await new Promise<'connected' | 'refused'>((resolve) => {
        client.on('connect', () => resolve('connected'));
        client.on('connect_error', () => resolve('refused'));
      });

      expect(outcome).toBe('refused');
      expect(client.connected).toBe(false);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'admits a participant and returns the assembled battle:state',
    async () => {
      const client = await connectAuthenticated(challengerToken);

      const outcome = await join(client, battleId);

      expect(outcome.event).toBe('state');
      const state = outcome.payload as BattleStatePayload;

      expect(state.battleId).toBe(battleId);
      // Joining an ACCEPTED battle is what fires the shared START transition.
      expect(state.status).toBe('IN_PROGRESS');
      expect(state.currentRound).toBe(1);
      expect(state.combatants).toHaveLength(2);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a non-participant and a non-existent battle with the byte-identical generic message',
    async () => {
      const strangerClient = await connectAuthenticated(strangerToken);
      const strangerOutcome = await join(strangerClient, battleId);

      const missingClient = await connectAuthenticated(challengerToken);
      const missingOutcome = await join(
        missingClient,
        '00000000-0000-4000-8000-000000000000',
      );

      expect(strangerOutcome.event).toBe('error');
      expect(missingOutcome.event).toBe('error');
      // A stranger to a real battle and a battle that never existed must be
      // indistinguishable — the whole point of the information-hiding rule.
      expect(strangerOutcome.payload).toEqual(missingOutcome.payload);
      expect(strangerOutcome.payload).toMatchObject({
        code: 'NOT_FOUND',
        message: 'Battle not found',
      });
    },
    NETWORK_TIMEOUT,
  );
});

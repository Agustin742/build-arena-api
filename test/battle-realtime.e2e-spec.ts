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
import { SequenceRandomSource } from './../src/combat';
import { RANDOM_SOURCE } from './../src/common/random-source.token';
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

type WindowView = {
  round: number;
  actorUserId: string;
  actionSkillCode: string;
  deadline: string;
  remainingMs: number;
  applicableSkillCodes: string[];
};

type LeftView = { userId: string; deadline: string };

type BattleStatePayload = {
  battleId: string;
  status: string;
  currentRound: number;
  activeUserId: string | null;
  combatants: unknown[];
  turns?: unknown[];
  openWindow?: WindowView | null;
  opponentLeft?: LeftView | null;
};

type BattleErrorPayload = { code: string; message: string; event?: string };

type BattleOpponentLeftPayload = { battleId: string } & LeftView;

type BattleEndedPayload = {
  battleId: string;
  winnerId: string;
  reason: 'DEFEAT' | 'ABANDONMENT';
  endedAt: string;
};

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
    | { event: 'state'; payload: BattleStatePayload }
    | { event: 'error'; payload: BattleErrorPayload }
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

type ReactionWindowPayload = {
  battleId: string;
  round: number;
  actorUserId: string;
  actionSkillCode: string;
  deadline: string;
  remainingMs: number;
  applicableSkillCodes: string[];
};

type TurnResolvedPayload = {
  battleId: string;
  round: number;
  turns: {
    sequence: number;
    skillCode: string | null;
    hit: boolean | null;
    damage: number;
  }[];
  combatants: { userId: string; currentHp: number }[];
  defeatedId: string | null;
};

type RoundStartPayload = {
  battleId: string;
  round: number;
  activeUserId: string;
};

/**
 * A full round, end to end: `battle:action` opens the window, the
 * defender's `battle:reaction` resolves it through `TurnResolutionService`,
 * and both clients converge on the identical `battle:turn_resolved` and
 * `battle:round_start`. A separate app instance because `RANDOM_SOURCE`
 * must be scripted before boot — the override replaces it wherever it is
 * registered, including `freezeCombatant`'s initiative roll during accept.
 */
describe('Battle realtime full round resolution (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let sockets: ClientSocket[] = [];
  let battleId: string;
  let challengerId: string;
  let opponentId: string;

  const challenger = credentialsFor('fchl');
  const opponent = credentialsFor('fopp');
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
      .send(buildFor(name))
      .expect(201);

    return (response.body as { id: string }).id;
  };

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RANDOM_SOURCE)
      // Budget: 2 initiative d20s (accept, challenger then opponent), then
      // the round's attack d20 and its 1d8 damage roll. Padded with margin
      // so a real double-resolution fails loudly instead of exhausting
      // silently on the wrong count.
      .useValue(new SequenceRandomSource([15, 5, 15, 5, 10, 10, 10, 10]))
      .compile();

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

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;

    const challengerToken = await register(challenger);
    const opponentToken = await register(opponent);

    const challengerBuildId = await createBuild(
      challengerToken,
      'FullRoundChallenger',
    );
    const opponentBuildId = await createBuild(
      opponentToken,
      'FullRoundOpponent',
    );

    const challengerUser = await prisma.user.findUniqueOrThrow({
      where: { email: challenger.email },
      select: { id: true },
    });
    const opponentUser = await prisma.user.findUniqueOrThrow({
      where: { email: opponent.email },
      select: { id: true },
    });
    challengerId = challengerUser.id;
    opponentId = opponentUser.id;

    const challengeResponse = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId, buildId: challengerBuildId })
      .expect(201);

    battleId = (challengeResponse.body as BattleView).id;

    await request(app.getHttpServer())
      .patch(`/battles/${battleId}/accept`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({ buildId: opponentBuildId })
      .expect(200);

    const challengerSocket = await connectAuthenticated(challengerToken);
    const opponentSocket = await connectAuthenticated(opponentToken);

    await Promise.all([
      new Promise<void>((resolve) => {
        challengerSocket.once('battle:state', () => resolve());
        challengerSocket.emit('battle:join', { battleId });
      }),
      new Promise<void>((resolve) => {
        opponentSocket.once('battle:state', () => resolve());
        opponentSocket.emit('battle:join', { battleId });
      }),
    ]);
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    const ids = [challengerId, opponentId];

    await prisma.battle.deleteMany({
      where: {
        OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'resolves a full round: action opens the window, the reaction resolves it, and both clients converge',
    async () => {
      const [challengerSocket, opponentSocket] = sockets;

      // Higher scripted initiative (15 vs 5) put the challenger active first.
      const windowPromise = new Promise<ReactionWindowPayload>((resolve) => {
        opponentSocket.once('battle:reaction_window', resolve);
      });
      challengerSocket.emit('battle:action', {
        battleId,
        skillCode: 'POWER_STRIKE',
      });
      const window = await windowPromise;

      expect(window.actorUserId).toBe(challengerId);
      expect(window.actionSkillCode).toBe('POWER_STRIKE');
      // Both PARRY and DODGE answer a PHYSICAL action; FIREBALL is an
      // ACTION-type skill and never a candidate.
      expect(window.applicableSkillCodes.sort()).toEqual(['DODGE', 'PARRY']);

      const turnResolvedPromises = Promise.all([
        new Promise<TurnResolvedPayload>((resolve) =>
          challengerSocket.once('battle:turn_resolved', resolve),
        ),
        new Promise<TurnResolvedPayload>((resolve) =>
          opponentSocket.once('battle:turn_resolved', resolve),
        ),
      ]);
      const roundStartPromises = Promise.all([
        new Promise<RoundStartPayload>((resolve) =>
          challengerSocket.once('battle:round_start', resolve),
        ),
        new Promise<RoundStartPayload>((resolve) =>
          opponentSocket.once('battle:round_start', resolve),
        ),
      ]);

      opponentSocket.emit('battle:reaction', { battleId, skillCode: 'PARRY' });

      const [challengerResolved, opponentResolved] = await turnResolvedPromises;

      expect(challengerResolved).toEqual(opponentResolved);
      expect(challengerResolved.round).toBe(1);
      expect(challengerResolved.defeatedId).toBeNull();
      expect(challengerResolved.turns).toEqual([
        expect.objectContaining({
          sequence: 1,
          skillCode: 'POWER_STRIKE',
          hit: true,
        }),
        expect.objectContaining({ sequence: 2, skillCode: 'PARRY' }),
      ]);
      // PARRY halves the raw 1d8(5)+2 = 7 damage down to 3.
      const defenderView = challengerResolved.combatants.find(
        (combatant) => combatant.userId === opponentId,
      );
      expect(defenderView?.currentHp).toBe(27);

      const [challengerRound, opponentRound] = await roundStartPromises;

      expect(challengerRound).toEqual(opponentRound);
      expect(challengerRound.round).toBe(2);
      expect(challengerRound.activeUserId).toBe(opponentId);
    },
    NETWORK_TIMEOUT,
  );
});

/**
 * The window's deadline lives in a column, so expiry is provable by
 * backdating that column instead of sleeping fifteen real seconds or
 * mixing fake timers with live socket I/O. That testability is the
 * concrete payoff of making the persisted deadline load-bearing, and the
 * reason the in-memory timer is only a comfort layer on top of it.
 */
describe('Battle realtime reaction window expiry (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let sockets: ClientSocket[] = [];
  let battleId: string;
  let challengerId: string;
  let opponentId: string;

  const challenger = credentialsFor('xchl');
  const opponent = credentialsFor('xopp');
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
      .send(buildFor(name))
      .expect(201);

    return (response.body as { id: string }).id;
  };

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RANDOM_SOURCE)
      // 2 initiative d20s at accept, then the expired round's attack d20 and
      // its 1d8. Padded so a double resolution fails loudly on the values
      // rather than quietly exhausting the script.
      .useValue(new SequenceRandomSource([15, 5, 15, 5, 10, 10, 10, 10]))
      .compile();

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

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;

    const challengerToken = await register(challenger);
    const opponentToken = await register(opponent);

    const challengerBuildId = await createBuild(
      challengerToken,
      'ExpiryChallenger',
    );
    const opponentBuildId = await createBuild(opponentToken, 'ExpiryOpponent');

    const challengerUser = await prisma.user.findUniqueOrThrow({
      where: { email: challenger.email },
      select: { id: true },
    });
    const opponentUser = await prisma.user.findUniqueOrThrow({
      where: { email: opponent.email },
      select: { id: true },
    });
    challengerId = challengerUser.id;
    opponentId = opponentUser.id;

    const challengeResponse = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId, buildId: challengerBuildId })
      .expect(201);

    battleId = (challengeResponse.body as BattleView).id;

    await request(app.getHttpServer())
      .patch(`/battles/${battleId}/accept`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({ buildId: opponentBuildId })
      .expect(200);

    const challengerSocket = await connectAuthenticated(challengerToken);
    const opponentSocket = await connectAuthenticated(opponentToken);

    await Promise.all([
      new Promise<void>((resolve) => {
        challengerSocket.once('battle:state', () => resolve());
        challengerSocket.emit('battle:join', { battleId });
      }),
      new Promise<void>((resolve) => {
        opponentSocket.once('battle:state', () => resolve());
        opponentSocket.emit('battle:join', { battleId });
      }),
    ]);
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    const ids = [challengerId, opponentId];

    await prisma.battle.deleteMany({
      where: {
        OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'settles an overdue window on the next message and leaves the reaction unspent',
    async () => {
      const [challengerSocket, opponentSocket] = sockets;

      const windowPromise = new Promise<ReactionWindowPayload>((resolve) => {
        opponentSocket.once('battle:reaction_window', resolve);
      });
      challengerSocket.emit('battle:action', {
        battleId,
        skillCode: 'POWER_STRIKE',
      });
      await windowPromise;

      // The whole point of the persisted deadline: no waiting, no fake
      // timers. The window is simply already in the past.
      await prisma.battle.update({
        where: { id: battleId },
        data: { reactionDeadline: new Date(Date.now() - 1_000) },
      });

      const resolvedPromises = Promise.all([
        new Promise<TurnResolvedPayload>((resolve) =>
          challengerSocket.once('battle:turn_resolved', resolve),
        ),
        new Promise<TurnResolvedPayload>((resolve) =>
          opponentSocket.once('battle:turn_resolved', resolve),
        ),
      ]);

      // A plain re-join is enough to drive the lazy path: every handler
      // settles an overdue window before doing its own work, which is what
      // must still happen after a restart killed any in-memory timer.
      opponentSocket.emit('battle:join', { battleId });

      const [challengerResolved, opponentResolved] = await resolvedPromises;

      expect(challengerResolved).toEqual(opponentResolved);
      expect(challengerResolved.round).toBe(1);
      expect(challengerResolved.turns[0]).toMatchObject({
        sequence: 1,
        skillCode: 'POWER_STRIKE',
      });
      // No reaction was declared, so the second record carries no skill.
      expect(challengerResolved.turns[1].skillCode).toBeNull();

      const defender = await prisma.battleCombatant.findFirstOrThrow({
        where: { battleId, userId: opponentId },
        select: { reactionAvailable: true },
      });
      // Expiry CONSERVES the reaction. Spending it is signalled by a
      // non-null reaction turn, and there was none.
      expect(defender.reactionAvailable).toBe(true);

      const battle = await prisma.battle.findUniqueOrThrow({
        where: { id: battleId },
        select: { pendingActionSkillCode: true, reactionDeadline: true },
      });
      expect(battle.pendingActionSkillCode).toBeNull();
      expect(battle.reactionDeadline).toBeNull();
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a reaction once no window is open',
    async () => {
      const [challengerSocket] = sockets;

      const errorPromise = new Promise<BattleErrorPayload>((resolve) => {
        challengerSocket.once('battle:error', resolve);
      });
      challengerSocket.emit('battle:reaction', {
        battleId,
        skillCode: 'PARRY',
      });

      expect((await errorPromise).code).toBe('NO_OPEN_WINDOW');
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses a second action while the actor own window is still open',
    async () => {
      const [challengerSocket, opponentSocket] = sockets;

      // Round 2 handed the turn to the opponent.
      const windowPromise = new Promise<ReactionWindowPayload>((resolve) => {
        challengerSocket.once('battle:reaction_window', resolve);
      });
      opponentSocket.emit('battle:action', {
        battleId,
        skillCode: 'POWER_STRIKE',
      });
      await windowPromise;

      const errorPromise = new Promise<BattleErrorPayload>((resolve) => {
        opponentSocket.once('battle:error', resolve);
      });
      opponentSocket.emit('battle:action', {
        battleId,
        skillCode: 'FIREBALL',
      });

      // Distinct from NOT_YOUR_TURN: it IS their turn, they already moved.
      expect((await errorPromise).code).toBe('ALREADY_DECLARED');
    },
    NETWORK_TIMEOUT,
  );
});

/**
 * The acceptance criterion for the whole realtime-battle phase: two clients
 * fight end to end, and disconnecting and reconnecting one recovers the
 * combat at the exact point it left off — read back from the DATABASE,
 * never from anything the server happened to still hold in memory. The
 * later abandonment closure is proved the exact same way the reaction
 * window's own expiry already is (see the describe block above): backdating
 * the persisted deadline instead of waiting out the real 2-minute grace
 * period.
 */
describe('Battle realtime disconnect, reconnect and abandonment recovery (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let url: string;
  let sockets: ClientSocket[] = [];
  let battleId: string;
  let challengerId: string;
  let opponentId: string;

  const challenger = credentialsFor('dchl');
  const opponent = credentialsFor('dopp');
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
      .send(buildFor(name))
      .expect(201);

    return (response.body as { id: string }).id;
  };

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

  let challengerToken: string;
  let opponentToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RANDOM_SOURCE)
      // 2 initiative d20s at accept, then the recovered round's attack d20
      // and its 1d8 — the abandonment closure consumes no dice at all.
      .useValue(new SequenceRandomSource([15, 5, 15, 5, 10, 10, 10, 10]))
      .compile();

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

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    url = `http://127.0.0.1:${address.port}`;

    challengerToken = await register(challenger);
    opponentToken = await register(opponent);

    const challengerBuildId = await createBuild(
      challengerToken,
      'DisconnectChallenger',
    );
    const opponentBuildId = await createBuild(
      opponentToken,
      'DisconnectOpponent',
    );

    const challengerUser = await prisma.user.findUniqueOrThrow({
      where: { email: challenger.email },
      select: { id: true },
    });
    const opponentUser = await prisma.user.findUniqueOrThrow({
      where: { email: opponent.email },
      select: { id: true },
    });
    challengerId = challengerUser.id;
    opponentId = opponentUser.id;

    const challengeResponse = await request(app.getHttpServer())
      .post('/battles')
      .set('Authorization', `Bearer ${challengerToken}`)
      .send({ opponentId, buildId: challengerBuildId })
      .expect(201);

    battleId = (challengeResponse.body as BattleView).id;

    await request(app.getHttpServer())
      .patch(`/battles/${battleId}/accept`)
      .set('Authorization', `Bearer ${opponentToken}`)
      .send({ buildId: opponentBuildId })
      .expect(200);
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    const ids = [challengerId, opponentId];

    await prisma.battle.deleteMany({
      where: {
        OR: [{ challengerId: { in: ids } }, { opponentId: { in: ids } }],
      },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    for (const socket of sockets) {
      socket.close();
    }
    sockets = [];
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'recovers a mid-window disconnect from the database, then closes the battle by abandonment once the deadline passes',
    async () => {
      const challengerSocket = await connectAuthenticated(challengerToken);
      const opponentSocket = await connectAuthenticated(opponentToken);

      await Promise.all([
        new Promise<void>((resolve) => {
          challengerSocket.once('battle:state', () => resolve());
          challengerSocket.emit('battle:join', { battleId });
        }),
        new Promise<void>((resolve) => {
          opponentSocket.once('battle:state', () => resolve());
          opponentSocket.emit('battle:join', { battleId });
        }),
      ]);

      // Round 1: the challenger (higher scripted initiative) declares.
      const windowPromise = new Promise<ReactionWindowPayload>((resolve) => {
        opponentSocket.once('battle:reaction_window', resolve);
      });
      challengerSocket.emit('battle:action', {
        battleId,
        skillCode: 'POWER_STRIKE',
      });
      const window = await windowPromise;
      expect(window.actorUserId).toBe(challengerId);

      // The defender's socket drops mid-window — a real TCP close.
      const opponentLeftPromise = new Promise<BattleOpponentLeftPayload>(
        (resolve) => {
          challengerSocket.once('battle:opponent_left', resolve);
        },
      );
      opponentSocket.close();
      const opponentLeft = await opponentLeftPromise;
      expect(opponentLeft.userId).toBe(opponentId);

      // Reconnect with a NEW socket before the 2-minute deadline elapses.
      const opponentSocket2 = await connectAuthenticated(opponentToken);
      const state = await new Promise<BattleStatePayload>((resolve) => {
        opponentSocket2.once('battle:state', resolve);
        opponentSocket2.emit('battle:join', { battleId });
      });

      // The window survived in the DATABASE: the same unchanged deadline,
      // a smaller recomputed remaining time, and the disconnect cleared.
      expect(state.openWindow).not.toBeNull();
      expect(state.openWindow?.deadline).toBe(window.deadline);
      expect(state.openWindow?.remainingMs).toBeLessThanOrEqual(
        window.remainingMs,
      );
      expect(state.opponentLeft).toBeNull();

      // The recovered client finishes the EXACT round it left off in.
      const turnResolvedPromises = Promise.all([
        new Promise<TurnResolvedPayload>((resolve) =>
          challengerSocket.once('battle:turn_resolved', resolve),
        ),
        new Promise<TurnResolvedPayload>((resolve) =>
          opponentSocket2.once('battle:turn_resolved', resolve),
        ),
      ]);
      const roundStartPromise = new Promise<RoundStartPayload>((resolve) => {
        challengerSocket.once('battle:round_start', resolve);
      });
      opponentSocket2.emit('battle:reaction', {
        battleId,
        skillCode: 'PARRY',
      });
      const [challengerResolved] = await turnResolvedPromises;
      expect(challengerResolved.round).toBe(1);
      expect(challengerResolved.defeatedId).toBeNull();

      const roundStart = await roundStartPromise;
      expect(roundStart.round).toBe(2);
      expect(roundStart.activeUserId).toBe(opponentId);

      // Round 2 hands the turn to the opponent, whose new socket now drops
      // for real, without ever declaring an action.
      const opponentLeftAgainPromise = new Promise<void>((resolve) => {
        challengerSocket.once('battle:opponent_left', () => resolve());
      });
      opponentSocket2.close();
      await opponentLeftAgainPromise;

      // No background sweep evaluates the deadline — it is settled lazily,
      // so the real 2-minute wait is bypassed exactly like the reaction
      // window's own expiry is bypassed above.
      await prisma.battle.update({
        where: { id: battleId },
        data: { disconnectDeadline: new Date(Date.now() - 1_000) },
      });

      const endedPromise = new Promise<BattleEndedPayload>((resolve) => {
        challengerSocket.once('battle:ended', resolve);
      });
      // The survivor's next message for the battle is what evaluates the
      // deadline — never a background sweep.
      challengerSocket.emit('battle:join', { battleId });
      const ended = await endedPromise;

      expect(ended.winnerId).toBe(challengerId);
      expect(ended.reason).toBe('ABANDONMENT');
      expect(ended.endedAt).toBeTruthy();

      const finalBattle = await prisma.battle.findUniqueOrThrow({
        where: { id: battleId },
        select: { status: true, winnerId: true, endedAt: true },
      });
      expect(finalBattle.status).toBe('FINISHED');
      expect(finalBattle.winnerId).toBe(challengerId);
      expect(finalBattle.endedAt).not.toBeNull();
    },
    NETWORK_TIMEOUT,
  );
});

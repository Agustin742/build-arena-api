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

const climber = {
  email: `climber_${stamp}@buildarena.dev`,
  username: `top_${tag}`,
  password: 'a-long-enough-password',
};

const straggler = {
  email: `straggler_${stamp}@buildarena.dev`,
  username: `low_${tag}`,
  password: 'a-long-enough-password',
};

type Entry = { rank: number; id: string; username: string; rating: number };

describe('Leaderboard against a real database (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let climberId: string;
  let stragglerId: string;

  const register = async (credentials: typeof climber): Promise<string> => {
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

    token = await register(climber);
    await register(straggler);

    // Ratings the seeded population cannot reach by accident, so the two
    // fixtures sit at known ends of the board.
    const promoted = await prisma.user.update({
      where: { email: climber.email },
      data: { rating: 9_999 },
      select: { id: true },
    });
    const demoted = await prisma.user.update({
      where: { email: straggler.email },
      data: { rating: -9_999 },
      select: { id: true },
    });

    climberId = promoted.id;
    stragglerId = demoted.id;
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [climber.email, straggler.email] } },
    });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'refuses the board without a token',
    async () => {
      await request(app.getHttpServer()).get('/leaderboard').expect(401);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'ranks the highest rating first and numbers positions from one',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/leaderboard')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const board = response.body as Entry[];

      expect(board[0]).toMatchObject({
        rank: 1,
        id: climberId,
        rating: 9_999,
      });
      expect(board.map((entry) => entry.rank)).toEqual(
        board.map((_, index) => index + 1),
      );
      // The straggler was pushed below every other row, so it must land
      // last — proving the sort runs over the whole table and not just over
      // whichever rows Postgres happened to return first.
      expect(board.at(-1)).toMatchObject({
        id: stragglerId,
        rating: -9_999,
        rank: board.length,
      });
      expect(
        board.every(
          (entry, index) =>
            index === 0 || board[index - 1].rating >= entry.rating,
        ),
      ).toBe(true);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'never puts a private column on the wire',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/leaderboard?limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const [entry] = response.body as Record<string, unknown>[];

      expect(Object.keys(entry).sort()).toEqual([
        'id',
        'rank',
        'rating',
        'username',
      ]);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'honours the limit and refuses one outside the allowed range',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/leaderboard?limit=1')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);

      await request(app.getHttpServer())
        .get('/leaderboard?limit=0')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);

      await request(app.getHttpServer())
        .get('/leaderboard?limit=101')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    },
    NETWORK_TIMEOUT,
  );
});

import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

type TokenPair = { accessToken: string; refreshToken: string };

const NETWORK_TIMEOUT = 60_000;

const credentials = {
  email: `flow_${Date.now()}@buildarena.dev`,
  username: `flow_${Date.now()}`,
  password: 'a-long-enough-password',
};

describe('Authentication flow against a real database (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get(PrismaService);
    await app.init();
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: credentials.email } });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'walks a user from registration to logout',
    async () => {
      const registration = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      expect(registration.body).toMatchObject({
        email: credentials.email,
        username: credentials.username,
        rating: 1200,
      });
      expect(registration.body).not.toHaveProperty('passwordHash');

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const first = login.body as TokenPair;

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(200)
        .expect((response) => {
          expect(response.body).toMatchObject({
            email: credentials.email,
            username: credentials.username,
          });
        });

      await request(app.getHttpServer()).get('/auth/me').expect(401);

      const rotation = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      const second = rotation.body as TokenPair;

      expect(second.refreshToken).not.toBe(first.refreshToken);

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: second.refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: second.refreshToken })
        .expect(401);

      const stored = await prisma.user.findUnique({
        where: { email: credentials.email },
      });

      expect(stored?.refreshTokenHash).toBeNull();
      expect(stored?.passwordHash).toMatch(/^\$2b\$12\$/);
      expect(stored?.passwordHash).not.toContain(credentials.password);
    },
    NETWORK_TIMEOUT,
  );
});

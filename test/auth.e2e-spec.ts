import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const storedUser = {
  id: 'e2f9b3c4-0000-4000-8000-000000000001',
  email: 'sylas@buildarena.dev',
  username: 'sylas',
  passwordHash: 'irrelevant',
  refreshTokenHash: null,
  rating: 1200,
  createdAt: new Date('2026-08-28T00:00:00.000Z'),
  updatedAt: new Date('2026-08-28T00:00:00.000Z'),
};

describe('Global authentication guard (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  beforeAll(() => {
    process.env.JWT_SECRET = 'access-secret-for-e2e';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-e2e';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: jest.fn(),
        onModuleDestroy: jest.fn(),
        user: { findUnique: jest.fn().mockResolvedValue(storedUser) },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    accessToken = await new JwtService({}).signAsync(
      { sub: storedUser.id, username: storedUser.username },
      { secret: process.env.JWT_SECRET, expiresIn: '15m' },
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('leaves routes marked public open', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('rejects a guarded route without a token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('rejects a guarded route with a forged token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = await new JwtService({}).signAsync(
      { sub: storedUser.id, username: storedUser.username },
      { secret: 'some-other-secret', expiresIn: '15m' },
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });

  it('returns the public profile for a valid token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      id: storedUser.id,
      email: storedUser.email,
      username: storedUser.username,
      rating: storedUser.rating,
      createdAt: storedUser.createdAt.toISOString(),
    });
  });
});

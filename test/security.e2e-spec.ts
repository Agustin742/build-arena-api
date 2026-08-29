import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

const CREDENTIAL_LIMIT = 5;

describe('Rate limiting (e2e)', () => {
  let app: INestApplication<App>;

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
        user: { findUnique: jest.fn().mockResolvedValue(null) },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lets the allowed number of login attempts through', async () => {
    for (let attempt = 0; attempt < CREDENTIAL_LIMIT; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@buildarena.dev', password: 'wrong-password-x' })
        .expect(401);
    }
  });

  it('answers 429 once the credential limit is exceeded', async () => {
    for (let attempt = 0; attempt < CREDENTIAL_LIMIT; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@buildarena.dev', password: 'wrong-password-x' })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ghost@buildarena.dev', password: 'wrong-password-x' })
      .expect(429);
  });

  it('keeps the credential limit away from other routes', async () => {
    for (let attempt = 0; attempt < CREDENTIAL_LIMIT + 1; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@buildarena.dev', password: 'wrong-password-x' });
    }

    await request(app.getHttpServer()).get('/health').expect(200);
  });
});

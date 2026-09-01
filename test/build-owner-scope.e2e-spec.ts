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

const owner = {
  email: `owner_${stamp}@buildarena.dev`,
  username: `own_${tag}`,
  password: 'a-long-enough-password',
};

const intruder = {
  email: `intruder_${stamp}@buildarena.dev`,
  username: `foe_${tag}`,
  password: 'a-long-enough-password',
};

const legalBuild = {
  name: `Hybrid duelist ${stamp}`,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
};

type Violation = { rule: string; message: string };

describe('Builds against a real database (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let ownerToken: string;
  let intruderToken: string;
  let buildId: string;

  const register = async (credentials: typeof owner): Promise<string> => {
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

    ownerToken = await register(owner);
    intruderToken = await register(intruder);
  }, NETWORK_TIMEOUT);

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [owner.email, intruder.email] } },
    });
    await app.close();
  }, NETWORK_TIMEOUT);

  it(
    'serves the seeded skill catalog to any authenticated user',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/skills')
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      const catalog = response.body as { code: string }[];

      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog.map((skill) => skill.code)).toContain('POWER_STRIKE');
    },
    NETWORK_TIMEOUT,
  );

  it(
    'refuses the catalog without a token',
    async () => {
      await request(app.getHttpServer()).get('/skills').expect(401);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'creates a legal build for the authenticated owner',
    async () => {
      const response = await request(app.getHttpServer())
        .post('/builds')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(legalBuild)
        .expect(201);

      const build = response.body as { id: string; skills: unknown[] };
      buildId = build.id;

      expect(build.skills).toHaveLength(4);
      expect(build).not.toHaveProperty('userId');
    },
    NETWORK_TIMEOUT,
  );

  it(
    'rejects an over-budget spread with the rule it breaks',
    async () => {
      const response = await request(app.getHttpServer())
        .post('/builds')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...legalBuild, name: `Overspent ${stamp}`, magic: 15 })
        .expect(400);

      const body = response.body as { violations: Violation[] };

      expect(body.violations.map((violation) => violation.rule)).toContain(
        'ATTRIBUTE_BUDGET_EXCEEDED',
      );
    },
    NETWORK_TIMEOUT,
  );

  it(
    'rejects a kit that costs more than the kit budget',
    async () => {
      const response = await request(app.getHttpServer())
        .post('/builds')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `Mono strength ${stamp}`,
          strength: 14,
          magic: 8,
          dexterity: 8,
          constitution: 8,
          skillCodes: ['RECKLESS_BLOW', 'POWER_STRIKE', 'COUNTER', 'PARRY'],
        })
        .expect(400);

      const body = response.body as { violations: Violation[] };

      expect(body.violations.map((violation) => violation.rule)).toContain(
        'KIT_BUDGET_EXCEEDED',
      );
    },
    NETWORK_TIMEOUT,
  );

  it(
    'rejects a skill the attributes do not unlock',
    async () => {
      const response = await request(app.getHttpServer())
        .post('/builds')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          name: `Under requirement ${stamp}`,
          strength: 15,
          magic: 11,
          dexterity: 12,
          constitution: 12,
          skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
        })
        .expect(400);

      const body = response.body as { violations: Violation[] };

      expect(body.violations.map((violation) => violation.rule)).toContain(
        'ATTRIBUTE_REQUIREMENT_NOT_MET',
      );
    },
    NETWORK_TIMEOUT,
  );

  it(
    'lets the owner read their own build',
    async () => {
      await request(app.getHttpServer())
        .get(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'answers 404 to somebody else asking for the build, even though it exists',
    async () => {
      await request(app.getHttpServer())
        .get(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(404);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'answers 404 to somebody else trying to change the build',
    async () => {
      await request(app.getHttpServer())
        .patch(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .send({ name: `Stolen ${stamp}` })
        .expect(404);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'answers 404 to somebody else trying to delete the build',
    async () => {
      await request(app.getHttpServer())
        .delete(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(404);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'keeps the build out of the list of anybody but its owner',
    async () => {
      const response = await request(app.getHttpServer())
        .get('/builds')
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    },
    NETWORK_TIMEOUT,
  );

  it(
    'lets the owner delete their own build',
    async () => {
      await request(app.getHttpServer())
        .delete(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/builds/${buildId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(404);
    },
    NETWORK_TIMEOUT,
  );
});

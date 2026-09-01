import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { numberEnv } from './common/env';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { SkillModule } from './skill/skill.module';

const DEFAULT_THROTTLE_TTL = 60_000;
const DEFAULT_THROTTLE_LIMIT = 100;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: numberEnv('THROTTLE_TTL', DEFAULT_THROTTLE_TTL),
        limit: numberEnv('THROTTLE_LIMIT', DEFAULT_THROTTLE_LIMIT),
      },
    ]),
    HealthModule,
    PrismaModule,
    AuthModule,
    SkillModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}

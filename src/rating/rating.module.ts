import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';
import { RatingService } from './rating.service';

/**
 * `PrismaModule` is deliberately non-global, so every module that touches
 * the database says so in its own `imports` (see `architecture.md`).
 */
@Module({
  imports: [PrismaModule],
  controllers: [LeaderboardController],
  providers: [RatingService, LeaderboardService],
  exports: [RatingService],
})
export class RatingModule {}

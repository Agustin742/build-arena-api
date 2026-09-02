import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RatingService } from './rating.service';

/**
 * `PrismaModule` is deliberately non-global, so every module that touches
 * the database says so in its own `imports` (see `architecture.md`).
 */
@Module({
  imports: [PrismaModule],
  providers: [RatingService],
  exports: [RatingService],
})
export class RatingModule {}

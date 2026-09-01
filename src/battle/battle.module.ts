import { Module } from '@nestjs/common';

import { randomSourceProvider } from '../common/random-source.token';
import { PrismaModule } from '../prisma/prisma.module';
import { BattleController } from './battle.controller';
import { BattleService } from './battle.service';

@Module({
  imports: [PrismaModule],
  controllers: [BattleController],
  providers: [BattleService, randomSourceProvider],
  exports: [BattleService],
})
export class BattleModule {}

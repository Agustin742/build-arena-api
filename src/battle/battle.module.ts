import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BattleController } from './battle.controller';
import { BattleService } from './battle.service';

@Module({
  imports: [PrismaModule],
  controllers: [BattleController],
  providers: [BattleService],
  exports: [BattleService],
})
export class BattleModule {}

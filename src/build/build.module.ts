import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { BuildController } from './build.controller';
import { BuildService } from './build.service';

@Module({
  imports: [PrismaModule],
  controllers: [BuildController],
  providers: [BuildService],
  exports: [BuildService],
})
export class BuildModule {}

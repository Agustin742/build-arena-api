import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { BattleModule } from '../battle/battle.module';
import { randomSourceProvider } from '../common/random-source.token';
import { PrismaModule } from '../prisma/prisma.module';
import { BattleGateway } from './battle.gateway';
import { BattleSessionService } from './battle-session.service';
import { TurnResolutionService } from './turn-resolution.service';

/**
 * `PrismaModule` is deliberately non-global, and `BattleModule` provides
 * but does not export `randomSourceProvider`, so re-declaring it here is
 * the established convention (see `BattleModule` itself).
 */
@Module({
  imports: [BattleModule, PrismaModule, JwtModule.register({})],
  providers: [
    BattleGateway,
    BattleSessionService,
    TurnResolutionService,
    randomSourceProvider,
  ],
})
export class WsModule {}

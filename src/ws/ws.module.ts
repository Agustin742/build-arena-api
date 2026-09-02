import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { BattleModule } from '../battle/battle.module';
import { randomSourceProvider } from '../common/random-source.token';
import { PrismaModule } from '../prisma/prisma.module';
import { RatingModule } from '../rating/rating.module';
import { BattleGateway } from './battle.gateway';
import { BattleSessionService } from './battle-session.service';
import { ReactionTimerRegistry } from './reaction-timer.registry';
import { TurnResolutionService } from './turn-resolution.service';

/**
 * `PrismaModule` is deliberately non-global, and `BattleModule` provides
 * but does not export `randomSourceProvider`, so re-declaring it here is
 * the established convention (see `BattleModule` itself).
 */
@Module({
  imports: [BattleModule, PrismaModule, RatingModule, JwtModule.register({})],
  providers: [
    BattleGateway,
    BattleSessionService,
    TurnResolutionService,
    ReactionTimerRegistry,
    randomSourceProvider,
  ],
})
export class WsModule {}

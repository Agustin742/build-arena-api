import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FriendshipController } from './friendship.controller';
import { FriendshipService } from './friendship.service';

@Module({
  imports: [PrismaModule],
  controllers: [FriendshipController],
  providers: [FriendshipService],
  exports: [FriendshipService],
})
export class FriendshipModule {}

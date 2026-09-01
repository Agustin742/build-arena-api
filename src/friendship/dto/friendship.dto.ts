import { ApiProperty } from '@nestjs/swagger';

import { FriendshipStatus } from '../../generated/prisma/enums';

class FriendshipPlayerDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'grace' })
  username!: string;

  @ApiProperty({ example: 1350 })
  rating!: number;
}

export class FriendshipDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: FriendshipStatus, enumName: 'FriendshipStatus' })
  status!: FriendshipStatus;

  @ApiProperty({
    enum: ['OUTGOING', 'INCOMING'],
    description: 'Whether you sent the request or received it',
  })
  direction!: 'OUTGOING' | 'INCOMING';

  @ApiProperty({ type: FriendshipPlayerDto, description: 'The other player' })
  player!: FriendshipPlayerDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

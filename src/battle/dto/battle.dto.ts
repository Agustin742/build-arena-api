import { ApiProperty } from '@nestjs/swagger';

import { BattleStatus } from '../../generated/prisma/enums';

class BattleRivalDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'grace' })
  username!: string;

  @ApiProperty({ example: 1350 })
  rating!: number;
}

export class BattleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: BattleStatus, enumName: 'BattleStatus' })
  status!: BattleStatus;

  @ApiProperty({
    example: true,
    description: 'False between accepted friends: friends do not farm rating',
  })
  ranked!: boolean;

  @ApiProperty({
    enum: ['CHALLENGER', 'OPPONENT'],
    description: 'Whether you sent the challenge or received it',
  })
  role!: 'CHALLENGER' | 'OPPONENT';

  @ApiProperty({ type: BattleRivalDto, description: 'The other player' })
  rival!: BattleRivalDto;

  @ApiProperty({
    enum: ['WON', 'LOST'],
    nullable: true,
    description: 'Null while the battle has no winner',
  })
  outcome!: 'WON' | 'LOST' | null;

  @ApiProperty({ example: 0 })
  currentRound!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endedAt!: Date | null;
}

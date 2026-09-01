import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateBattleDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The player you are challenging. Not yourself',
  })
  @IsUUID()
  opponentId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'One of your builds. It is the one you will fight with, and it is frozen when the challenge is accepted',
  })
  @IsUUID()
  buildId!: string;
}

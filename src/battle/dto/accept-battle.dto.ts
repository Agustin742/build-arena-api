import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AcceptBattleDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'One of your builds. Accepting freezes it, and editing it afterwards no longer changes this fight',
  })
  @IsUUID()
  buildId!: string;
}

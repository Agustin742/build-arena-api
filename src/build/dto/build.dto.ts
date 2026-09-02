import { ApiProperty } from '@nestjs/swagger';

import { SkillDto } from '../../skill/dto/skill.dto';

export class BuildDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Hybrid duelist' })
  name!: string;

  @ApiProperty({ example: 14 })
  strength!: number;

  @ApiProperty({ example: 13 })
  magic!: number;

  @ApiProperty({ example: 12 })
  dexterity!: number;

  @ApiProperty({ example: 10 })
  constitution!: number;

  @ApiProperty({
    type: SkillDto,
    isArray: true,
    description: 'The kit, resolved into full catalog entries',
  })
  skills!: SkillDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

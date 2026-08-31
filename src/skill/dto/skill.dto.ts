import { ApiProperty } from '@nestjs/swagger';

import {
  Attribute,
  ConditionType,
  SkillType,
} from '../../generated/prisma/enums';

export class SkillDto {
  @ApiProperty({
    example: 'VENOM_BOLT',
    description: 'Stable identifier. Kits and combat turns reference this code',
  })
  code!: string;

  @ApiProperty({ example: 'Venom Bolt' })
  name!: string;

  @ApiProperty({
    example: 'Little damage on impact, and poison that lingers.',
  })
  description!: string;

  @ApiProperty({
    enum: SkillType,
    description: 'A build carries two actions and two reactions',
  })
  type!: SkillType;

  @ApiProperty({
    example: 4,
    description: 'Points this skill takes from the kit budget',
  })
  cost!: number;

  @ApiProperty({ enum: Attribute })
  requiredAttribute!: Attribute;

  @ApiProperty({
    example: 11,
    description: 'Minimum value the required attribute must reach',
  })
  requiredValue!: number;

  @ApiProperty({
    example: '1d4',
    nullable: true,
    description: 'Damage expression, or null when the skill deals none',
  })
  damageDice!: string | null;

  @ApiProperty({ enum: ConditionType, nullable: true })
  appliesCondition!: ConditionType | null;

  @ApiProperty({
    example: 3,
    nullable: true,
    description: 'Rounds the applied condition lasts',
  })
  conditionRounds!: number | null;
}

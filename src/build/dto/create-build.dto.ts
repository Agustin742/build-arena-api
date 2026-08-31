import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Length,
} from 'class-validator';

import { ACTIONS_PER_BUILD, REACTIONS_PER_BUILD } from '../rules';

/**
 * The kit never holds more slots than a build has. This is a payload bound, not
 * a game rule: it keeps an oversized array from reaching the catalog query. How
 * many actions and reactions a legal kit carries is decided by the rules module.
 */
const MAX_KIT_SIZE = ACTIONS_PER_BUILD + REACTIONS_PER_BUILD;

export class CreateBuildDto {
  @ApiProperty({ example: 'Hybrid duelist', minLength: 3, maxLength: 40 })
  @IsString()
  @Length(3, 40)
  name!: string;

  @ApiProperty({
    example: 15,
    description: 'Between 8 and 15. The spread must fit the attribute budget',
  })
  @IsInt()
  strength!: number;

  @ApiProperty({ example: 13 })
  @IsInt()
  magic!: number;

  @ApiProperty({ example: 12 })
  @IsInt()
  dexterity!: number;

  @ApiProperty({ example: 10 })
  @IsInt()
  constitution!: number;

  @ApiProperty({
    example: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
    description: 'Skill codes from GET /skills. Two actions and two reactions',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_KIT_SIZE)
  @IsString({ each: true })
  skillCodes!: string[];
}

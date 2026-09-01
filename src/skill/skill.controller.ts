import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { SkillDto } from './dto/skill.dto';
import type { PublicSkill } from './skill.mapper';
import { SkillService } from './skill.service';

@ApiTags('skill')
@Controller('skills')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Full skill catalog',
    description:
      'Read only. The catalog is seeded, so there is no write endpoint',
  })
  @ApiOkResponse({ type: SkillDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid access token' })
  findAll(): Promise<PublicSkill[]> {
    return this.skillService.findAll();
  }
}

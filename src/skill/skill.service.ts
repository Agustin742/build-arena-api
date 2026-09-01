import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { toPublicSkill } from './skill.mapper';
import type { PublicSkill } from './skill.mapper';

@Injectable()
export class SkillService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PublicSkill[]> {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ type: 'asc' }, { cost: 'asc' }, { code: 'asc' }],
    });

    return skills.map(toPublicSkill);
  }
}

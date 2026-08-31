import { Attribute, ConditionType, SkillType } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { SkillService } from './skill.service';

const rows = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    code: 'POWER_STRIKE',
    name: 'Power Strike',
    description: 'A heavy swing that trades finesse for raw damage.',
    type: SkillType.ACTION,
    cost: 4,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 12,
    damageDice: '1d8',
    appliesCondition: null as ConditionType | null,
    conditionRounds: null as number | null,
  },
];

describe('SkillService', () => {
  let findMany: jest.Mock;
  let service: SkillService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue(rows);
    service = new SkillService({
      skill: { findMany },
    } as unknown as PrismaService);
  });

  it('returns the whole catalog as public entries', async () => {
    await expect(service.findAll()).resolves.toEqual([
      {
        code: 'POWER_STRIKE',
        name: 'Power Strike',
        description: 'A heavy swing that trades finesse for raw damage.',
        type: SkillType.ACTION,
        cost: 4,
        requiredAttribute: Attribute.STRENGTH,
        requiredValue: 12,
        damageDice: '1d8',
        appliesCondition: null,
        conditionRounds: null,
      },
    ]);
  });

  it('orders actions before reactions, then by cost, then by code', async () => {
    await service.findAll();

    expect(findMany).toHaveBeenCalledWith({
      orderBy: [{ type: 'asc' }, { cost: 'asc' }, { code: 'asc' }],
    });
  });
});

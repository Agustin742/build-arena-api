import { Attribute, SkillType } from '../generated/prisma/enums';
import { toPublicBuild } from './build.mapper';

const row = {
  id: '22222222-0000-4000-8000-000000000001',
  userId: '11111111-0000-4000-8000-000000000009',
  name: 'Hybrid duelist',
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  skills: [
    {
      buildId: '22222222-0000-4000-8000-000000000001',
      skillId: '33333333-0000-4000-8000-000000000001',
      skill: {
        id: '33333333-0000-4000-8000-000000000001',
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
    },
  ],
};

describe('toPublicBuild', () => {
  it('flattens the join table into the catalog entries themselves', () => {
    expect(toPublicBuild(row).skills).toEqual([
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

  it('keeps the attributes and the identity of the build', () => {
    const build = toPublicBuild(row);

    expect(build.id).toBe(row.id);
    expect(build.name).toBe('Hybrid duelist');
    expect(build.strength).toBe(15);
    expect(build.magic).toBe(13);
    expect(build.dexterity).toBe(12);
    expect(build.constitution).toBe(10);
  });

  it('never exposes the owner, because a build is only ever read by its owner', () => {
    expect(toPublicBuild(row)).not.toHaveProperty('userId');
  });
});

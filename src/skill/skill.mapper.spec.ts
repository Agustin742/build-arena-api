import { Attribute, ConditionType, SkillType } from '../generated/prisma/enums';
import { toPublicSkill } from './skill.mapper';

const row = {
  id: '11111111-0000-4000-8000-000000000001',
  code: 'VENOM_BOLT',
  name: 'Venom Bolt',
  description: 'Little damage on impact, and poison that lingers.',
  type: SkillType.ACTION,
  cost: 4,
  requiredAttribute: Attribute.MAGIC,
  requiredValue: 11,
  damageDice: '1d4',
  appliesCondition: ConditionType.POISONED,
  conditionRounds: 3,
};

describe('toPublicSkill', () => {
  it('exposes the catalog entry the client needs to build a kit', () => {
    expect(toPublicSkill(row)).toEqual({
      code: 'VENOM_BOLT',
      name: 'Venom Bolt',
      description: 'Little damage on impact, and poison that lingers.',
      type: SkillType.ACTION,
      cost: 4,
      requiredAttribute: Attribute.MAGIC,
      requiredValue: 11,
      damageDice: '1d4',
      appliesCondition: ConditionType.POISONED,
      conditionRounds: 3,
    });
  });

  it('drops the database identifier, because the catalog is addressed by code', () => {
    expect(toPublicSkill(row)).not.toHaveProperty('id');
  });
});

import type { Skill } from '../generated/prisma/client';
import type {
  Attribute,
  ConditionType,
  SkillType,
} from '../generated/prisma/enums';

export type PublicSkill = {
  code: string;
  name: string;
  description: string;
  type: SkillType;
  cost: number;
  requiredAttribute: Attribute;
  requiredValue: number;
  damageDice: string | null;
  appliesCondition: ConditionType | null;
  conditionRounds: number | null;
};

export function toPublicSkill(skill: Skill): PublicSkill {
  return {
    code: skill.code,
    name: skill.name,
    description: skill.description,
    type: skill.type,
    cost: skill.cost,
    requiredAttribute: skill.requiredAttribute,
    requiredValue: skill.requiredValue,
    damageDice: skill.damageDice,
    appliesCondition: skill.appliesCondition,
    conditionRounds: skill.conditionRounds,
  };
}

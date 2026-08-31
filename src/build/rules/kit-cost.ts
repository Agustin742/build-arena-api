import type { Attribute, SkillType } from '../../generated/prisma/enums';

/**
 * Eighteen points, not twenty. Twenty is exactly what the mono-strength kit
 * costs, and that kit unlocks with a single attribute at 14 — which would
 * untie the two halves of the build from each other.
 */
export const KIT_BUDGET = 18;

export const ACTIONS_PER_BUILD = 2;
export const REACTIONS_PER_BUILD = 2;

/** What the rules need to know about a catalog entry. */
export type CatalogSkill = {
  code: string;
  type: SkillType;
  cost: number;
  requiredAttribute: Attribute;
  requiredValue: number;
};

export function kitCost(skills: Pick<CatalogSkill, 'cost'>[]): number {
  return skills.reduce((total, skill) => total + skill.cost, 0);
}

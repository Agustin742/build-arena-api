import { Attribute } from '../../generated/prisma/enums';
import { SkillType } from '../../generated/prisma/enums';
import {
  ATTRIBUTE_BUDGET,
  BASE_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  spreadCost,
} from './attribute-cost';
import type { BuildAttributes } from './attribute-cost';
import {
  ACTIONS_PER_BUILD,
  KIT_BUDGET,
  REACTIONS_PER_BUILD,
  kitCost,
} from './kit-cost';
import type { CatalogSkill } from './kit-cost';

export type BuildDraft = BuildAttributes & {
  skillCodes: string[];
};

export type BuildRule =
  | 'ATTRIBUTE_OUT_OF_RANGE'
  | 'ATTRIBUTE_BUDGET_EXCEEDED'
  | 'UNKNOWN_SKILL'
  | 'DUPLICATE_SKILL'
  | 'SLOT_COUNT'
  | 'KIT_BUDGET_EXCEEDED'
  | 'ATTRIBUTE_REQUIREMENT_NOT_MET';

export type BuildRuleViolation = {
  rule: BuildRule;
  message: string;
};

const ATTRIBUTE_FIELD: Record<Attribute, keyof BuildAttributes> = {
  [Attribute.STRENGTH]: 'strength',
  [Attribute.MAGIC]: 'magic',
  [Attribute.DEXTERITY]: 'dexterity',
  [Attribute.CONSTITUTION]: 'constitution',
};

const ATTRIBUTE_FIELDS: (keyof BuildAttributes)[] = [
  'strength',
  'magic',
  'dexterity',
  'constitution',
];

function inRange(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= BASE_ATTRIBUTE_VALUE &&
    value <= MAX_ATTRIBUTE_VALUE
  );
}

function attributeViolations(
  attributes: BuildAttributes,
): BuildRuleViolation[] {
  const outOfRange = ATTRIBUTE_FIELDS.filter(
    (field) => !inRange(attributes[field]),
  ).map<BuildRuleViolation>((field) => ({
    rule: 'ATTRIBUTE_OUT_OF_RANGE',
    message: `${field} must be a whole number between ${BASE_ATTRIBUTE_VALUE} and ${MAX_ATTRIBUTE_VALUE}, got ${attributes[field]}`,
  }));

  // The cost table has no entry for an out-of-range value, so the budget
  // cannot be computed until every value is legal.
  if (outOfRange.length > 0) {
    return outOfRange;
  }

  const spent = spreadCost(attributes);

  if (spent > ATTRIBUTE_BUDGET) {
    return [
      {
        rule: 'ATTRIBUTE_BUDGET_EXCEEDED',
        message: `The spread costs ${spent} points and the budget is ${ATTRIBUTE_BUDGET}`,
      },
    ];
  }

  return [];
}

function kitViolations(
  draft: BuildDraft,
  catalog: CatalogSkill[],
): BuildRuleViolation[] {
  const byCode = new Map(catalog.map((skill) => [skill.code, skill]));
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const code of draft.skillCodes) {
    if (seen.has(code)) {
      duplicates.add(code);
    }

    seen.add(code);
  }

  const unknown = [...seen].filter((code) => !byCode.has(code));

  // Slots, budget and requirements are all read off the resolved catalog
  // entries, so a kit that does not resolve cleanly is reported as-is instead
  // of cascading into violations the player did not really commit.
  if (duplicates.size > 0 || unknown.length > 0) {
    return [
      ...[...duplicates].map<BuildRuleViolation>((code) => ({
        rule: 'DUPLICATE_SKILL',
        message: `${code} is taken more than once`,
      })),
      ...unknown.map<BuildRuleViolation>((code) => ({
        rule: 'UNKNOWN_SKILL',
        message: `${code} is not in the skill catalog`,
      })),
    ];
  }

  const chosen = draft.skillCodes.map(
    (code) => byCode.get(code) as CatalogSkill,
  );
  const violations: BuildRuleViolation[] = [];
  const actions = chosen.filter((skill) => skill.type === SkillType.ACTION);
  const reactions = chosen.filter((skill) => skill.type === SkillType.REACTION);

  if (
    actions.length !== ACTIONS_PER_BUILD ||
    reactions.length !== REACTIONS_PER_BUILD
  ) {
    violations.push({
      rule: 'SLOT_COUNT',
      message: `A build takes ${ACTIONS_PER_BUILD} actions and ${REACTIONS_PER_BUILD} reactions, got ${actions.length} and ${reactions.length}`,
    });
  }

  const spent = kitCost(chosen);

  if (spent > KIT_BUDGET) {
    violations.push({
      rule: 'KIT_BUDGET_EXCEEDED',
      message: `The kit costs ${spent} points and the budget is ${KIT_BUDGET}`,
    });
  }

  for (const skill of chosen) {
    const field = ATTRIBUTE_FIELD[skill.requiredAttribute];

    if (draft[field] < skill.requiredValue) {
      violations.push({
        rule: 'ATTRIBUTE_REQUIREMENT_NOT_MET',
        message: `${skill.code} needs ${field} ${skill.requiredValue}, the build has ${draft[field]}`,
      });
    }
  }

  return violations;
}

/**
 * The whole legality contract of a build, as a list of what it breaks. An
 * empty list means the build is legal. The service turns a non-empty list into
 * a 400 that names the rules, because a rejection the player cannot read is a
 * rejection they cannot fix.
 */
export function validateBuild(
  draft: BuildDraft,
  catalog: CatalogSkill[],
): BuildRuleViolation[] {
  return [...attributeViolations(draft), ...kitViolations(draft, catalog)];
}

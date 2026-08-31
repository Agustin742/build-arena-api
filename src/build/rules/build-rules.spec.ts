import { Attribute, SkillType } from '../../generated/prisma/enums';
import type { CatalogSkill } from './kit-cost';
import { validateBuild } from './build-rules';
import type { BuildDraft } from './build-rules';

const catalog: CatalogSkill[] = [
  {
    code: 'POWER_STRIKE',
    type: SkillType.ACTION,
    cost: 4,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 12,
  },
  {
    code: 'RECKLESS_BLOW',
    type: SkillType.ACTION,
    cost: 6,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 14,
  },
  {
    code: 'PRECISE_SHOT',
    type: SkillType.ACTION,
    cost: 5,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 13,
  },
  {
    code: 'FIREBALL',
    type: SkillType.ACTION,
    cost: 5,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 12,
  },
  {
    code: 'VENOM_BOLT',
    type: SkillType.ACTION,
    cost: 4,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 11,
  },
  {
    code: 'MIND_SPIKE',
    type: SkillType.ACTION,
    cost: 7,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 14,
  },
  {
    code: 'BRACE',
    type: SkillType.REACTION,
    cost: 3,
    requiredAttribute: Attribute.CONSTITUTION,
    requiredValue: 12,
  },
  {
    code: 'PARRY',
    type: SkillType.REACTION,
    cost: 4,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 12,
  },
  {
    code: 'DODGE',
    type: SkillType.REACTION,
    cost: 4,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 12,
  },
  {
    code: 'ARCANE_WARD',
    type: SkillType.REACTION,
    cost: 5,
    requiredAttribute: Attribute.MAGIC,
    requiredValue: 12,
  },
  {
    code: 'COUNTER',
    type: SkillType.REACTION,
    cost: 6,
    requiredAttribute: Attribute.STRENGTH,
    requiredValue: 14,
  },
  {
    code: 'RIPOSTE',
    type: SkillType.REACTION,
    cost: 7,
    requiredAttribute: Attribute.DEXTERITY,
    requiredValue: 14,
  },
];

const hybrid: BuildDraft = {
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
};

const draft = (overrides: Partial<BuildDraft>): BuildDraft => ({
  ...hybrid,
  ...overrides,
});

const rulesBroken = (input: BuildDraft): string[] =>
  validateBuild(input, catalog).map((violation) => violation.rule);

describe('validateBuild', () => {
  it('accepts a legal build', () => {
    expect(validateBuild(hybrid, catalog)).toEqual([]);
  });

  it('accepts the balanced spread, which costs the same as the specialist', () => {
    const balanced = draft({
      strength: 13,
      magic: 13,
      dexterity: 13,
      constitution: 13,
      skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
    });

    expect(validateBuild(balanced, catalog)).toEqual([]);
  });
});

describe('validateBuild attribute rules', () => {
  it('rejects a value below the base every build starts from', () => {
    expect(rulesBroken(draft({ constitution: 7 }))).toContain(
      'ATTRIBUTE_OUT_OF_RANGE',
    );
  });

  it('rejects a value past the top of the cost table', () => {
    expect(rulesBroken(draft({ strength: 16 }))).toContain(
      'ATTRIBUTE_OUT_OF_RANGE',
    );
  });

  it('rejects a value that is not a whole number', () => {
    expect(rulesBroken(draft({ magic: 12.5 }))).toContain(
      'ATTRIBUTE_OUT_OF_RANGE',
    );
  });

  it('names the attribute that is out of range', () => {
    const [violation] = validateBuild(draft({ dexterity: 20 }), catalog);

    expect(violation.message).toContain('dexterity');
  });

  it('rejects a spread that spends more than the budget', () => {
    const overspent = draft({
      strength: 15,
      magic: 15,
      dexterity: 15,
      constitution: 8,
    });

    expect(rulesBroken(overspent)).toContain('ATTRIBUTE_BUDGET_EXCEEDED');
  });

  it('says how much the spread costs and what the budget is', () => {
    const overspent = draft({
      strength: 15,
      magic: 15,
      dexterity: 15,
      constitution: 8,
    });
    const [violation] = validateBuild(overspent, catalog);

    expect(violation.message).toContain('27');
    expect(violation.message).toContain('20');
  });

  it('does not check the budget when a value is off the cost table', () => {
    expect(rulesBroken(draft({ strength: 40 }))).toEqual([
      'ATTRIBUTE_OUT_OF_RANGE',
    ]);
  });
});

describe('validateBuild kit rules', () => {
  it('rejects a code that is not in the catalog', () => {
    const unknown = draft({
      skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'CHAIN_LIGHTNING'],
    });

    expect(rulesBroken(unknown)).toEqual(['UNKNOWN_SKILL']);
  });

  it('rejects the same skill taken twice', () => {
    const repeated = draft({
      skillCodes: ['POWER_STRIKE', 'POWER_STRIKE', 'PARRY', 'DODGE'],
    });

    expect(rulesBroken(repeated)).toEqual(['DUPLICATE_SKILL']);
  });

  it('rejects a kit that is not two actions and two reactions', () => {
    const threeActions = draft({
      skillCodes: ['POWER_STRIKE', 'FIREBALL', 'VENOM_BOLT', 'PARRY'],
    });

    expect(rulesBroken(threeActions)).toContain('SLOT_COUNT');
  });

  it('rejects a kit with fewer than four skills', () => {
    expect(rulesBroken(draft({ skillCodes: ['POWER_STRIKE'] }))).toContain(
      'SLOT_COUNT',
    );
  });

  it('rejects the degenerate mono-strength kit on budget alone', () => {
    const monoStrength = draft({
      strength: 14,
      magic: 8,
      dexterity: 8,
      constitution: 8,
      skillCodes: ['RECKLESS_BLOW', 'POWER_STRIKE', 'COUNTER', 'PARRY'],
    });

    expect(rulesBroken(monoStrength)).toEqual(['KIT_BUDGET_EXCEEDED']);
  });

  it('keeps the two most expensive skills from ever sharing a kit', () => {
    const bothExpensive = draft({
      strength: 8,
      magic: 14,
      dexterity: 14,
      constitution: 8,
      skillCodes: ['MIND_SPIKE', 'VENOM_BOLT', 'RIPOSTE', 'DODGE'],
    });

    expect(rulesBroken(bothExpensive)).toContain('KIT_BUDGET_EXCEEDED');
  });

  it('rejects a skill whose attribute requirement is not met', () => {
    const underRequirement = draft({
      strength: 15,
      magic: 11,
      dexterity: 12,
      constitution: 12,
      skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
    });

    expect(rulesBroken(underRequirement)).toEqual([
      'ATTRIBUTE_REQUIREMENT_NOT_MET',
    ]);
  });

  it('names the skill and the requirement it misses', () => {
    const underRequirement = draft({
      strength: 15,
      magic: 11,
      dexterity: 12,
      constitution: 12,
    });
    const [violation] = validateBuild(underRequirement, catalog);

    expect(violation.message).toContain('FIREBALL');
    expect(violation.message).toContain('magic');
    expect(violation.message).toContain('12');
  });

  it('reports every rule the build breaks, not just the first', () => {
    const broken = draft({
      strength: 15,
      magic: 15,
      dexterity: 15,
      constitution: 8,
      skillCodes: ['MIND_SPIKE', 'RECKLESS_BLOW', 'RIPOSTE', 'BRACE'],
    });

    expect(rulesBroken(broken)).toEqual([
      'ATTRIBUTE_BUDGET_EXCEEDED',
      'KIT_BUDGET_EXCEEDED',
      'ATTRIBUTE_REQUIREMENT_NOT_MET',
    ]);
  });
});

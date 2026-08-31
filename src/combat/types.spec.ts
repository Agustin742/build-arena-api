import * as CombatTypes from './types';
import type { ConditionType, AttributeKey, SkillKind } from './types';
import {
  ConditionType as PrismaConditionType,
  Attribute as PrismaAttribute,
  SkillType as PrismaSkillType,
} from '../generated/prisma/client';

describe('combat domain types', () => {
  it('is a pure type-only module with zero runtime surface', () => {
    expect(Object.keys(CombatTypes)).toEqual([]);
  });

  it.each([
    ['POISONED', 'STUNNED'],
    ['WEAKENED', 'POISONED'],
  ])(
    'ConditionType literals (%s, %s) are mutually assignable with the Prisma enum',
    (first, second) => {
      // Compile-time-only guard: these assignments only type-check if
      // `ConditionType` and the generated `Prisma.ConditionType` stay
      // mutually assignable in both directions. ts-jest runs with
      // isolatedModules (no type-check), so a broken union will NOT fail
      // `pnpm test` -- it fails `pnpm build`, which does full type-check.
      const asPrisma: PrismaConditionType = first as ConditionType;
      const asDomain: ConditionType = second as PrismaConditionType;

      expect(Object.values(PrismaConditionType)).toContain(asPrisma);
      expect(Object.values(PrismaConditionType)).toContain(asDomain);
    },
  );

  it.each([
    ['STRENGTH', 'MAGIC'],
    ['DEXTERITY', 'CONSTITUTION'],
  ])(
    'AttributeKey literals (%s, %s) are mutually assignable with the Prisma enum',
    (first, second) => {
      const asPrisma: PrismaAttribute = first as AttributeKey;
      const asDomain: AttributeKey = second as PrismaAttribute;

      expect(Object.values(PrismaAttribute)).toContain(asPrisma);
      expect(Object.values(PrismaAttribute)).toContain(asDomain);
    },
  );

  it.each([
    ['ACTION', 'REACTION'],
    ['REACTION', 'ACTION'],
  ])(
    'SkillKind literals (%s, %s) are mutually assignable with the Prisma enum',
    (first, second) => {
      const asPrisma: PrismaSkillType = first as SkillKind;
      const asDomain: SkillKind = second as PrismaSkillType;

      expect(Object.values(PrismaSkillType)).toContain(asPrisma);
      expect(Object.values(PrismaSkillType)).toContain(asDomain);
    },
  );
});

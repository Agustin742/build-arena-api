import { modifier } from './arithmetic';
import { attributeOf, rollDamage } from './damage';
import { rollD20With } from './d20';
import type { RandomSource } from './random-source';
import type { Combatant, CombatSkill, RollBias } from './types';

export type PhysicalAttackInput = {
  readonly attacker: Combatant;
  readonly skill: CombatSkill;
  /** Effective armor class for this attack; DODGE's bonus is already applied by the caller. */
  readonly armorClass: number;
  readonly bias: RollBias;
  readonly random: RandomSource;
};

export type PhysicalAttackResult = {
  readonly rolls: readonly number[];
  readonly kept: number;
  readonly targetValue: number;
  readonly hit: boolean;
  readonly critical: boolean;
  readonly rawDamage: number;
};

/**
 * `d20 + mod(resolvingAttribute)` versus the (possibly boosted) armor
 * class. A natural 20 is always a hit and a critical; a natural 1 is
 * always a miss regardless of the total — both decided before armor
 * class is consulted (Decision E), so DODGE can never negate a critical
 * and can never rescue a natural 1. R14: the resolving attribute is the
 * skill's own `requiredAttribute`, not strength — PRECISE_SHOT resolves
 * with dexterity.
 */
export const resolvePhysicalAttack = (
  input: PhysicalAttackInput,
): PhysicalAttackResult => {
  const { attacker, skill, armorClass, bias, random } = input;
  const { rolls, kept } = rollD20With(random, bias);
  const attributeMod = modifier(attributeOf(attacker, skill.requiredAttribute));
  const targetValue = kept + attributeMod;
  const critical = kept === 20;
  const hit = kept === 1 ? false : critical ? true : targetValue >= armorClass;

  const rawDamage =
    hit && skill.damageDice
      ? rollDamage(random, skill.damageDice, attributeMod, critical)
      : 0;

  return { rolls, kept, targetValue, hit, critical, rawDamage };
};

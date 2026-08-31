import { clampDamage, halve, modifier } from '../core/arithmetic';
import type { RandomSource } from '../core/random-source';
import type { AttributeKey, Combatant, MitigationSpec } from '../types';

/** Reads a single named attribute off a `Combatant`. */
export const attributeOf = (
  combatant: Combatant,
  key: AttributeKey,
): number => {
  switch (key) {
    case 'STRENGTH':
      return combatant.strength;
    case 'MAGIC':
      return combatant.magic;
    case 'DEXTERITY':
      return combatant.dexterity;
    case 'CONSTITUTION':
      return combatant.constitution;
  }
};

/**
 * Rolls a skill's damage dice plus a flat bonus. A critical rolls the
 * skill's own notation a second time and sums it (R15/D2) — two separate
 * `rollDice` calls with the unchanged notation, never one call with a
 * doubled notation, so the R15 assertion is the call count.
 */
export const rollDamage = (
  random: RandomSource,
  notation: string,
  bonus: number,
  critical: boolean,
): number => {
  const first = random.rollDice(notation);
  const total = critical ? first + random.rollDice(notation) : first;
  return total + bonus;
};

/**
 * Ordered damage reduction chain (D4): WEAKENED, then a successful save,
 * then PARRY, then the flat BRACE subtraction last, then clamp at zero.
 * The three halvings provably commute under floor division
 * (`floor(floor(x/2)/2) = floor(x/4)`), so their relative order cannot
 * matter; the flat BRACE subtraction does not commute, so it is fixed
 * last, guarded by `value > 0` so it can never raise damage that was
 * already zero.
 */
export const reduceDamage = (
  raw: number,
  ctx: {
    readonly dealerWeakened: boolean;
    readonly savePassed: boolean;
    readonly mitigation: MitigationSpec | null;
    readonly reactor: Combatant;
  },
): number => {
  let value = clampDamage(raw);
  if (ctx.dealerWeakened) value = halve(value); // R3 WEAKENED
  if (ctx.savePassed) value = halve(value); // overview.md §4.3
  if (ctx.mitigation?.kind === 'HALVE') value = halve(value); // R6 PARRY
  if (ctx.mitigation?.kind === 'FLAT' && value > 0) {
    // R5 BRACE: the *reduction* has a floor of `minimum`, never the
    // resulting damage — a negative constitution modifier must not turn
    // BRACE into a damage increase.
    const reduction = Math.max(
      ctx.mitigation.minimum,
      modifier(attributeOf(ctx.reactor, ctx.mitigation.from)),
    );
    value = value - reduction;
  }
  return clampDamage(value);
};

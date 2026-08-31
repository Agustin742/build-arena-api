import { modifier } from '../core/arithmetic';
import { rollDamage } from './damage';
import { rollD20With } from '../core/d20';
import type { RandomSource } from '../core/random-source';
import type { Combatant, CombatSkill } from '../types';

export type MagicAttackInput = {
  readonly attacker: Combatant;
  readonly defender: Combatant;
  readonly skill: CombatSkill;
  /** ARCANE_WARD's bonus to the defender's save roll; 0 when no such reaction is active. */
  readonly wardBonus: number;
  readonly random: RandomSource;
};

export type MagicAttackResult = {
  readonly difficulty: number;
  readonly rolls: readonly number[];
  readonly kept: number;
  readonly savePassed: boolean;
  readonly rawDamage: number;
};

/**
 * `8 + mod(attacker.magic)`, lowered by 2 while the ATTACKER is POISONED
 * (Decision G). Reads the attacker's own conditions directly through the
 * slice-1 `ActiveConditionState` union, importing nothing from a future
 * slice-3 `conditions.ts` module — the same discipline `reduceDamage` uses
 * for `dealerWeakened`.
 */
export const saveDifficultyFor = (attacker: Combatant): number =>
  8 +
  modifier(attacker.magic) -
  (attacker.conditions.some((condition) => condition.type === 'POISONED')
    ? 2
    : 0);

/**
 * A magic attack rolls no attack roll and never crits (R12). The defender
 * rolls `d20 + mod(constitution)` plus ARCANE_WARD's `wardBonus` against a
 * `saveDifficulty` computed from the ATTACKER (R13, Decision G) — the only
 * step of the resolution that reads the attacker's conditions instead of
 * the defender's. Saving throws are never biased (overview.md), so the
 * roll always resolves through `rollD20With` at `NORMAL` bias. A natural
 * 20 or 1 on the save is an ordinary success or failure, nothing more
 * (Decision 4). The damage dice carry no attribute bonus, unlike a
 * physical attack's `+ mod(strength)`; a successful save's halving is
 * left to `reduceDamage`, so it composes with WEAKENED/PARRY/BRACE the
 * same way the physical path already does.
 */
export const resolveMagicAttack = (
  input: MagicAttackInput,
): MagicAttackResult => {
  const { attacker, defender, skill, wardBonus, random } = input;
  const difficulty = saveDifficultyFor(attacker);
  const { rolls, kept } = rollD20With(random, 'NORMAL');
  const total = kept + modifier(defender.constitution) + wardBonus;
  const savePassed = total >= difficulty;
  const rawDamage = skill.damageDice
    ? rollDamage(random, skill.damageDice, 0, false)
    : 0;

  return { difficulty, rolls, kept, savePassed, rawDamage };
};

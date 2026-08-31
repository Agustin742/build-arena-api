import type { RandomSource } from './random-source';
import type { RollBias } from './types';

/**
 * Boolean equality is exactly §4.4's non-stacking and mutual cancellation:
 * two advantage sources are still one advantage, and advantage with
 * disadvantage collapses to a clean single roll (Decision D).
 */
export const resolveBias = (
  advantage: boolean,
  disadvantage: boolean,
): RollBias =>
  advantage === disadvantage
    ? 'NORMAL'
    : advantage
      ? 'ADVANTAGE'
      : 'DISADVANTAGE';

/**
 * Rolls a d20 once under NORMAL bias, or twice under ADVANTAGE/DISADVANTAGE,
 * keeping the higher or the lower value. `RandomSource` never learns that
 * advantage exists — it is asked for a d20 once or twice, and the caller
 * keeps the max or the min.
 */
export const rollD20With = (
  random: RandomSource,
  bias: RollBias,
): { readonly rolls: readonly number[]; readonly kept: number } => {
  if (bias === 'NORMAL') {
    const only = random.rollD20();
    return { rolls: [only], kept: only };
  }
  const rolls = [random.rollD20(), random.rollD20()] as const;
  return {
    rolls,
    kept: bias === 'ADVANTAGE' ? Math.max(...rolls) : Math.min(...rolls),
  };
};

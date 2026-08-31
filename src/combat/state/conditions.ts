import type {
  ActiveConditionState,
  Combatant,
  CombatSkill,
  ConditionType,
  RollBias,
} from '../types';

const hasCondition = (combatant: Combatant, type: ConditionType): boolean =>
  combatant.conditions.some((condition) => condition.type === type);

/**
 * POISONED gives the bearer disadvantage on every attack roll it makes
 * (R1). This is the only bias source in the catalog today: unbiased
 * combatants roll `NORMAL`. The caller feeds this straight into
 * `rollD20With` — `RandomSource` never learns that a condition exists.
 */
export const attackBiasFor = (combatant: Combatant): RollBias =>
  hasCondition(combatant, 'POISONED') ? 'DISADVANTAGE' : 'NORMAL';

/**
 * While STUNNED is active on the combatant whose turn it is, the engine
 * MUST skip both the action and the reaction for that round (R2, Decision
 * B). Full skip-turn composition is wired in `turn.ts` (slice 4); this
 * predicate is the pure read the pipeline gates on.
 */
export const isStunned = (combatant: Combatant): boolean =>
  hasCondition(combatant, 'STUNNED');

/**
 * While WEAKENED is active on the attacking combatant, the damage it
 * deals is halved (R3). The halving arithmetic itself lives in
 * `reduceDamage` (slice 2); this predicate is the pure read that feeds
 * `reduceDamage`'s `dealerWeakened` flag.
 */
export const isWeakened = (combatant: Combatant): boolean =>
  hasCondition(combatant, 'WEAKENED');

/**
 * Applies a condition to a combatant. Re-applying a condition of a type
 * already active refreshes `roundsRemaining` to the new value instead of
 * stacking a second entry (R16) — `ActiveCondition`'s
 * `@@unique([combatantId, type])` already forbids stacking at the schema
 * level; this mirrors that invariant in the pure engine state.
 */
export const applyCondition = (
  combatant: Combatant,
  condition: ActiveConditionState,
): { readonly combatant: Combatant; readonly refreshed: boolean } => {
  const refreshed = hasCondition(combatant, condition.type);
  const conditions = refreshed
    ? combatant.conditions.map((existing) =>
        existing.type === condition.type ? condition : existing,
      )
    : [...combatant.conditions, condition];

  return { combatant: { ...combatant, conditions }, refreshed };
};

/**
 * Reads the condition a skill applies, if any. Pure translator from the
 * catalog row to the condition-to-apply — gating on whether the action
 * actually landed (hit for physical, failed save for magic, R13) is a
 * pipeline concern composed in `turn.ts` (slice 4), not this helper's job.
 */
export const conditionFromSkill = (
  skill: CombatSkill,
): { readonly type: ConditionType; readonly rounds: number } | null =>
  skill.appliesCondition && skill.conditionRounds
    ? { type: skill.appliesCondition, rounds: skill.conditionRounds }
    : null;

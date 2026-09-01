export { isRanked, validateChallenge } from './battle-rules';
export type { BattleRule, BattleRuleViolation } from './battle-rules';

export { BATTLE_TRANSITIONS, applyTransition } from './battle-transitions';
export type {
  BattlePair,
  BattleTransition,
  Entitled,
  StoredBattle,
  TransitionDenialReason,
  TransitionOutcome,
  TransitionRule,
} from './battle-transitions';

export { freezeCombatant } from './combatant-freeze';
export type { CombatantAttributes, FrozenCombatant } from './combatant-freeze';

export { isRanked, validateChallenge } from './battle-rules';
export type { BattleRule, BattleRuleViolation } from './battle-rules';

export {
  BATTLE_CLOSURE,
  BATTLE_TRANSITIONS,
  applyTransition,
  closeBattle,
} from './battle-transitions';
export type {
  BattlePair,
  BattleTransition,
  ClosureOutcome,
  ClosureReason,
  Entitled,
  StoredBattle,
  TransitionDenialReason,
  TransitionOutcome,
  TransitionRule,
} from './battle-transitions';

export { freezeCombatant } from './combatant-freeze';
export type { CombatantAttributes, FrozenCombatant } from './combatant-freeze';

export { participantClause } from './participant-clause';

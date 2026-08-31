import type { RandomSource } from './random-source';

export type ConditionType = 'POISONED' | 'STUNNED' | 'WEAKENED';
export type AttributeKey = 'STRENGTH' | 'MAGIC' | 'DEXTERITY' | 'CONSTITUTION';
export type SkillKind = 'ACTION' | 'REACTION';
export type ActionResolution = 'PHYSICAL' | 'MAGIC';
export type RollBias = 'NORMAL' | 'ADVANTAGE' | 'DISADVANTAGE';

/** = ActiveCondition minus `id` and `combatantId`. */
export type ActiveConditionState = {
  readonly type: ConditionType;
  readonly roundsRemaining: number;
};

/** = BattleCombatant minus `battleId`/`buildId`, plus its conditions. */
export type Combatant = {
  readonly id: string;
  readonly userId: string;
  readonly strength: number;
  readonly magic: number;
  readonly dexterity: number;
  readonly constitution: number;
  readonly armorClass: number;
  readonly maxHp: number;
  readonly currentHp: number;
  readonly initiative: number;
  readonly reactionAvailable: boolean;
  readonly conditions: readonly ActiveConditionState[];
};

/** Structural subset of `Skill`: a Prisma catalog row is directly assignable. */
export type CombatSkill = {
  readonly code: string;
  readonly type: SkillKind;
  readonly requiredAttribute: AttributeKey;
  readonly damageDice: string | null;
  readonly appliesCondition: ConditionType | null;
  readonly conditionRounds: number | null;
};

export type DeclaredAction = {
  readonly actorId: string;
  readonly skill: CombatSkill;
};
export type DeclaredReaction = {
  readonly actorId: string;
  readonly skill: CombatSkill;
};

/** = BattleTurn minus `id`, `battleId`, `createdAt` (all database-owned). */
export type TurnRecord = {
  readonly round: number;
  readonly sequence: number;
  readonly actorId: string;
  readonly kind: SkillKind;
  readonly skillCode: string | null;
  readonly attackRoll: number | null;
  readonly targetValue: number | null;
  readonly hit: boolean | null;
  readonly critical: boolean;
  readonly damage: number;
};

export type CombatEvent =
  | {
      readonly type: 'ROUND_STARTED';
      readonly round: number;
      readonly actorId: string;
    }
  | { readonly type: 'REACTION_RECHARGED'; readonly combatantId: string }
  | {
      readonly type: 'CONDITION_TICKED';
      readonly combatantId: string;
      readonly condition: ConditionType;
      readonly roundsRemaining: number;
    }
  | {
      readonly type: 'CONDITION_EXPIRED';
      readonly combatantId: string;
      readonly condition: ConditionType;
    }
  | {
      readonly type: 'CONDITION_APPLIED';
      readonly combatantId: string;
      readonly condition: ConditionType;
      readonly rounds: number;
      readonly refreshed: boolean;
    }
  | {
      readonly type: 'TURN_SKIPPED';
      readonly combatantId: string;
      readonly reason: 'STUNNED';
    }
  | {
      readonly type: 'REACTION_IGNORED';
      readonly combatantId: string;
      readonly skillCode: string;
      readonly reason: 'NOT_APPLICABLE' | 'UNAVAILABLE' | 'STUNNED';
    }
  | {
      readonly type: 'ATTACK_ROLLED';
      readonly actorId: string;
      readonly rolls: readonly number[];
      readonly kept: number;
      readonly targetValue: number;
      readonly hit: boolean;
      readonly critical: boolean;
    }
  | {
      readonly type: 'SAVE_ROLLED';
      readonly defenderId: string;
      readonly rolls: readonly number[];
      readonly kept: number;
      readonly difficulty: number;
      readonly passed: boolean;
    }
  | {
      readonly type: 'DAMAGE_MITIGATED';
      readonly targetId: string;
      readonly skillCode: string;
      readonly before: number;
      readonly after: number;
    }
  | {
      readonly type: 'DAMAGE_APPLIED';
      readonly targetId: string;
      readonly amount: number;
      readonly currentHp: number;
    }
  | {
      readonly type: 'COUNTER_ATTACKED';
      readonly actorId: string;
      readonly skillCode: string;
      readonly damage: number;
    }
  | { readonly type: 'COMBATANT_DEFEATED'; readonly combatantId: string };

export type TurnInput = {
  readonly round: number;
  readonly actor: Combatant;
  readonly defender: Combatant;
  readonly action: DeclaredAction;
  readonly reaction: DeclaredReaction | null;
  readonly random: RandomSource;
};

export type TurnResolution = {
  readonly actor: Combatant;
  readonly defender: Combatant;
  // 1 or 2 rows, ascending `sequence`
  readonly turns: readonly TurnRecord[];
  readonly events: readonly CombatEvent[];
  readonly defeatedId: string | null;
};

/** Reaction mitigation shape: a halving (PARRY) or a flat reduction with a floor (BRACE). */
export type MitigationSpec =
  | { readonly kind: 'HALVE' }
  | {
      readonly kind: 'FLAT';
      readonly from: AttributeKey;
      readonly minimum: number;
    };

/** Reaction behavior: which action types it answers, its defense bonus, mitigation, and counter. */
export type ReactionBehavior = {
  readonly answers: ActionResolution | 'ANY';
  readonly defense: {
    readonly bonusFrom: AttributeKey;
    readonly target: 'ARMOR_CLASS' | 'SAVE_ROLL';
  } | null;
  readonly mitigation: MitigationSpec | null;
  readonly counter: {
    readonly on: 'HIT' | 'MISS';
    readonly bonusFrom: AttributeKey;
  } | null;
};

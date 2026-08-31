import { modifier } from './arithmetic';
import { attackBiasFor, isStunned, isWeakened } from './conditions';
import { attributeOf, reduceDamage } from './damage';
import { resolveMagicAttack } from './magic-attack';
import { resolvePhysicalAttack } from './physical-attack';
import { isApplicable, REACTION_TABLE } from './reactions';
import type {
  ActionResolution,
  Combatant,
  CombatEvent,
  DeclaredAction,
  DeclaredReaction,
  ReactionBehavior,
  TurnInput,
  TurnRecord,
  TurnResolution,
} from './types';

const resolutionOf = (action: DeclaredAction): ActionResolution =>
  action.skill.requiredAttribute === 'MAGIC' ? 'MAGIC' : 'PHYSICAL';

type ReactionIgnoredReason = 'NOT_APPLICABLE' | 'UNAVAILABLE' | 'STUNNED';

type ResolvedReaction = {
  readonly behavior: ReactionBehavior;
  readonly declared: DeclaredReaction;
};

type ReactionGate = {
  readonly resolved: ResolvedReaction | null;
  readonly ignoredReason: ReactionIgnoredReason | null;
};

/**
 * Gates a declared reaction against STUNNED first (it disables reactions
 * outright, R2), then applicability (R4), then availability. A reaction
 * that fails any check is ignored with an event, never an error (D7).
 */
const gateReaction = (
  reaction: DeclaredReaction | null,
  defender: Combatant,
  resolution: ActionResolution,
): ReactionGate => {
  if (!reaction) return { resolved: null, ignoredReason: null };

  if (isStunned(defender)) {
    return { resolved: null, ignoredReason: 'STUNNED' };
  }

  const behavior = REACTION_TABLE[reaction.skill.code];
  if (!behavior || !isApplicable(behavior, resolution)) {
    return { resolved: null, ignoredReason: 'NOT_APPLICABLE' };
  }

  if (!defender.reactionAvailable) {
    return { resolved: null, ignoredReason: 'UNAVAILABLE' };
  }

  return { resolved: { behavior, declared: reaction }, ignoredReason: null };
};

/**
 * The nine-step turn pipeline (R11): defense modifiers, the action roll,
 * damage, mitigation, HP subtraction, the death short-circuit, the
 * counter-attack, condition application, and the two emitted rows. Pure
 * and deterministic — every roll flows through the injected `random`, and
 * `input` is never mutated; each step reassigns local `actor`/`defender`
 * bindings instead.
 */
export const resolveTurn = (input: TurnInput): TurnResolution => {
  const { round, action, reaction, random } = input;
  const actor = input.actor;
  let defender = input.defender;
  const events: CombatEvent[] = [];

  // STUNNED removes both the action and the reaction for the round (R2,
  // Decision B) — a hard short-circuit before step 1 even begins. Only
  // one row is emitted: there was no action to react to.
  if (isStunned(actor)) {
    events.push({
      type: 'TURN_SKIPPED',
      combatantId: actor.id,
      reason: 'STUNNED',
    });
    const skippedRow: TurnRecord = {
      round,
      sequence: 1,
      actorId: actor.id,
      kind: 'ACTION',
      skillCode: null,
      attackRoll: null,
      targetValue: null,
      hit: null,
      critical: false,
      damage: 0,
      skipped: true,
    };
    return { actor, defender, turns: [skippedRow], events, defeatedId: null };
  }

  const resolution = resolutionOf(action);
  const { resolved, ignoredReason } = gateReaction(
    reaction,
    defender,
    resolution,
  );

  if (reaction && ignoredReason) {
    events.push({
      type: 'REACTION_IGNORED',
      combatantId: defender.id,
      skillCode: reaction.skill.code,
      reason: ignoredReason,
    });
  }

  // Step 1 — defense modifiers, applied before the roll. DODGE lands on
  // armor class, ARCANE_WARD lands on the defender's save roll, never on
  // the difficulty (Decision G keeps the two independent).
  const defense = resolved?.behavior.defense ?? null;
  const armorBonus =
    defense?.target === 'ARMOR_CLASS'
      ? modifier(attributeOf(defender, defense.bonusFrom))
      : 0;
  const wardBonus =
    defense?.target === 'SAVE_ROLL'
      ? modifier(attributeOf(defender, defense.bonusFrom))
      : 0;
  const effectiveArmorClass = defender.armorClass + armorBonus;

  // Step 2 — resolve the action roll. Physical compares against the
  // (possibly boosted) armor class; magic rolls a saving throw against a
  // difficulty read from the attacker (R13, Decision G), with the ward
  // bonus landing on the defender's roll only.
  let kept: number;
  let targetValue: number;
  let hit: boolean;
  let critical: boolean;
  let rawDamage: number;
  let savePassed = false;

  if (resolution === 'PHYSICAL') {
    const bias = attackBiasFor(actor);
    const physical = resolvePhysicalAttack({
      attacker: actor,
      skill: action.skill,
      armorClass: effectiveArmorClass,
      bias,
      random,
    });
    kept = physical.kept;
    targetValue = physical.targetValue;
    hit = physical.hit;
    critical = physical.critical;
    rawDamage = physical.rawDamage;
    events.push({
      type: 'ATTACK_ROLLED',
      actorId: actor.id,
      rolls: physical.rolls,
      kept: physical.kept,
      targetValue: effectiveArmorClass,
      hit,
      critical,
    });
  } else {
    const magic = resolveMagicAttack({
      attacker: actor,
      defender,
      skill: action.skill,
      wardBonus,
      random,
    });
    kept = magic.kept;
    targetValue = magic.difficulty;
    savePassed = magic.savePassed;
    hit = !savePassed;
    critical = false;
    rawDamage = magic.rawDamage;
    events.push({
      type: 'SAVE_ROLLED',
      defenderId: defender.id,
      rolls: magic.rolls,
      kept: magic.kept,
      difficulty: magic.difficulty,
      passed: savePassed,
    });
  }

  // Steps 3 and 4 — damage and its ordered mitigation (D4). `rawDamage`
  // already carries the "no dice on a physical miss" rule (R11 step 3)
  // from `resolvePhysicalAttack`, so `reduceDamage` composes safely even
  // when `rawDamage` is 0.
  const mitigation = resolved?.behavior.mitigation ?? null;
  const mitigatedDamage = reduceDamage(rawDamage, {
    dealerWeakened: isWeakened(actor),
    savePassed,
    mitigation,
    reactor: defender,
  });
  if (mitigatedDamage !== rawDamage) {
    events.push({
      type: 'DAMAGE_MITIGATED',
      targetId: defender.id,
      skillCode: action.skill.code,
      before: rawDamage,
      after: mitigatedDamage,
    });
  }

  // Step 5 — subtract HP.
  const defenderHpAfter = Math.max(0, defender.currentHp - mitigatedDamage);
  defender = { ...defender, currentHp: defenderHpAfter };
  events.push({
    type: 'DAMAGE_APPLIED',
    targetId: defender.id,
    amount: mitigatedDamage,
    currentHp: defenderHpAfter,
  });

  // TODO (part B, tasks 4.3/4.4): step 6 death short-circuit, step 7
  // counter-attack, step 8 condition application. Steps 6-8 are not wired
  // yet; this stage only proves steps 1-5.
  const defeatedId: string | null = null;
  const counterDamage = 0;
  const counterFired = false;

  // Step 9 — always emit exactly two rows: the action, then the reaction
  // (sequence 1 and 2), matching `BattleTurn.@@unique([battleId, round,
  // sequence])`.
  const actionRow: TurnRecord = {
    round,
    sequence: 1,
    actorId: input.actor.id,
    kind: 'ACTION',
    skillCode: action.skill.code,
    attackRoll: kept,
    targetValue,
    hit,
    critical,
    damage: mitigatedDamage,
  };

  const reactionRow: TurnRecord = {
    round,
    sequence: 2,
    actorId: defender.id,
    kind: 'REACTION',
    skillCode: resolved ? resolved.declared.skill.code : null,
    attackRoll: null,
    targetValue: null,
    hit: null,
    critical: false,
    damage: counterFired ? counterDamage : 0,
    ...(ignoredReason === 'STUNNED' ? { skipped: true } : {}),
  };

  return {
    actor,
    defender,
    turns: [actionRow, reactionRow],
    events,
    defeatedId,
  };
};

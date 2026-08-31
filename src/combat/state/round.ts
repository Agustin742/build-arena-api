import type { CombatEvent, Combatant } from '../types';

export type StartRoundInput = {
  readonly round: number;
  readonly actor: Combatant;
};

export type StartRoundResult = {
  readonly actor: Combatant;
  readonly events: readonly CombatEvent[];
};

/**
 * Pure round-start tick (Decision C). The engine only computes the new
 * state and the events that describe it — Phase 5 decides when to call
 * this and persists the result; nothing here reads a clock or Prisma.
 *
 * Scoped to the acting combatant only (Decision F): the opponent is never
 * a parameter, so `startRound` cannot read or mutate the opponent's
 * conditions or reaction. A duration therefore counts the bearer's own
 * turns — "POISONED 3 rounds" means the bearer's next three turns.
 *
 * Order is remove-then-decrement, never the reverse:
 *   1. Drop every condition already at `roundsRemaining === 0` (emit
 *      `CONDITION_EXPIRED`).
 *   2. Decrement the survivors by one (emit `CONDITION_TICKED`).
 *   3. Recharge the acting combatant's reaction (emit `REACTION_RECHARGED`).
 * Decrementing first would let a one-round condition (e.g. STUNNED applied
 * with `roundsRemaining: 1`) reach 0 and get removed on the very call that
 * was supposed to make it bite, silently turning MIND_SPIKE — the
 * catalog's costliest skill — permanently inert.
 */
export const startRound = (input: StartRoundInput): StartRoundResult => {
  const { round, actor } = input;
  const events: CombatEvent[] = [
    { type: 'ROUND_STARTED', round, actorId: actor.id },
  ];

  const survivors = actor.conditions.filter((condition) => {
    const expired = condition.roundsRemaining === 0;
    if (expired) {
      events.push({
        type: 'CONDITION_EXPIRED',
        combatantId: actor.id,
        condition: condition.type,
      });
    }
    return !expired;
  });

  const ticked = survivors.map((condition) => {
    const roundsRemaining = condition.roundsRemaining - 1;
    events.push({
      type: 'CONDITION_TICKED',
      combatantId: actor.id,
      condition: condition.type,
      roundsRemaining,
    });
    return { ...condition, roundsRemaining };
  });

  events.push({ type: 'REACTION_RECHARGED', combatantId: actor.id });

  return {
    actor: { ...actor, conditions: ticked, reactionAvailable: true },
    events,
  };
};

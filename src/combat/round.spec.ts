import { startRound } from './round';
import type { Combatant } from './types';

const buildCombatant = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'combatant-1',
  userId: 'user-1',
  strength: 10,
  magic: 10,
  dexterity: 10,
  constitution: 10,
  armorClass: 10,
  maxHp: 30,
  currentHp: 30,
  initiative: 0,
  reactionAvailable: false,
  conditions: [],
  ...overrides,
});

describe('startRound', () => {
  it('reaches the acting combatant conditions only, leaving the opponent untouched (Decision F)', () => {
    const actor = buildCombatant({
      id: 'actor-1',
      conditions: [{ type: 'POISONED', roundsRemaining: 3 }],
    });
    const opponent = buildCombatant({
      id: 'opponent-1',
      conditions: [{ type: 'WEAKENED', roundsRemaining: 2 }],
    });

    const { actor: updatedActor } = startRound({ round: 1, actor });

    expect(updatedActor.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 2 },
    ]);
    // startRound never receives the opponent, so it cannot have touched it —
    // this pins that `startRound` takes a single combatant, not a roster.
    expect(opponent.conditions).toEqual([
      { type: 'WEAKENED', roundsRemaining: 2 },
    ]);
  });

  it('consumes a duration over the bearer\'s own turns: POISONED/3 bites for three turns before it expires', () => {
    const actor = buildCombatant({
      conditions: [{ type: 'POISONED', roundsRemaining: 3 }],
    });

    const afterTurn1 = startRound({ round: 1, actor });
    expect(afterTurn1.actor.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 2 },
    ]);

    const afterTurn2 = startRound({ round: 2, actor: afterTurn1.actor });
    expect(afterTurn2.actor.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 1 },
    ]);

    const afterTurn3 = startRound({ round: 3, actor: afterTurn2.actor });
    // Still present (roundsRemaining 0) — this is the third of the bearer's
    // own turns the duration was meant to cost.
    expect(afterTurn3.actor.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 0 },
    ]);

    const afterTurn4 = startRound({ round: 4, actor: afterTurn3.actor });
    // Removed only at the start of the bearer's fourth own turn.
    expect(afterTurn4.actor.conditions).toEqual([]);
  });

  it('ticks an active condition down by one and keeps it active', () => {
    const actor = buildCombatant({
      conditions: [{ type: 'WEAKENED', roundsRemaining: 2 }],
    });

    const { actor: updatedActor, events } = startRound({ round: 5, actor });

    expect(updatedActor.conditions).toEqual([
      { type: 'WEAKENED', roundsRemaining: 1 },
    ]);
    expect(events).toContainEqual({
      type: 'CONDITION_TICKED',
      combatantId: actor.id,
      condition: 'WEAKENED',
      roundsRemaining: 1,
    });
  });

  it(
    'REGRESSION (remove-then-decrement, not the reverse): a one-round condition ' +
      'still bites on the turn it was meant to cost, guarding against MIND_SPIKE ' +
      'going permanently inert (Engram 232, 234)',
    () => {
      const actor = buildCombatant({
        conditions: [{ type: 'STUNNED', roundsRemaining: 1 }],
      });

      const { actor: updatedActor } = startRound({ round: 2, actor });

      // Decrement-then-remove would compute 1 -> 0 and immediately strip it
      // on this very call, letting the bearer act normally on the turn it
      // was supposed to lose. Remove-then-decrement keeps it present with
      // roundsRemaining 0: nothing was at 0 when the removal step ran, so
      // nothing was removed, and only then did the survivor decrement.
      expect(updatedActor.conditions).toEqual([
        { type: 'STUNNED', roundsRemaining: 0 },
      ]);
    },
  );

  it('expires a condition at the following round start once it already reached zero', () => {
    const actor = buildCombatant({
      conditions: [{ type: 'STUNNED', roundsRemaining: 0 }],
    });

    const { actor: updatedActor, events } = startRound({ round: 3, actor });

    expect(updatedActor.conditions).toEqual([]);
    expect(events).toContainEqual({
      type: 'CONDITION_EXPIRED',
      combatantId: actor.id,
      condition: 'STUNNED',
    });
  });

  it('recharges the acting combatant reaction (Decision C)', () => {
    const actor = buildCombatant({ reactionAvailable: false });

    const { actor: updatedActor, events } = startRound({ round: 1, actor });

    expect(updatedActor.reactionAvailable).toBe(true);
    expect(events).toContainEqual({
      type: 'REACTION_RECHARGED',
      combatantId: actor.id,
    });
  });
});

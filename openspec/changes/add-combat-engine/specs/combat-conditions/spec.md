# Combat Conditions Specification

## Purpose

Defines the mechanical effect, application, refresh, round-start tick, and
expiration of the three active conditions: POISONED, STUNNED, WEAKENED. Also
defines the pure round-start function (Decision C) that ticks durations down
and recharges reactions.

## Requirements

### Requirement: POISONED Imposes Disadvantage on Attack Rolls (R1)

While POISONED is active on a combatant, the engine MUST apply disadvantage
to every attack roll that combatant makes.

#### Scenario: A poisoned attacker rolls with disadvantage

- GIVEN the attacker has POISONED with roundsRemaining 2, strength mod +2, defender armorClass 14
- WHEN rollD20() is called twice, returning 16 then 6, keeping the lower (6)
- THEN the total is 8, which misses armorClass 14, even though the discarded roll would have hit

### Requirement: STUNNED Removes Both Action and Reaction (R2, Decision B)

While STUNNED is active on the combatant whose turn it is, the engine MUST
skip both the action and the reaction for that round and MUST return an
explicit skipped-turn result rather than an empty one:
`skipped: true`, `skillCode: null`, `attackRoll: null`, `targetValue: null`,
`hit: null`, `critical: false`, `damage: 0`. The engine MUST also emit an
event naming the cause.

#### Scenario: A stunned actor's action is recorded as skipped, not empty

- GIVEN the acting combatant has STUNNED with roundsRemaining 1
- WHEN their turn is resolved
- THEN the action result has `skipped: true`, all rollable fields null, damage 0, and an accompanying `TURN_SKIPPED_STUNNED` event

#### Scenario: A stunned defender cannot use a reaction

- GIVEN the defending combatant has STUNNED with roundsRemaining 1 and had declared PARRY
- WHEN the attacker's action resolves
- THEN the reaction result is also `skipped: true` and PARRY's mitigation MUST NOT apply

### Requirement: WEAKENED Halves Damage Dealt, Rounding Down (R3)

While WEAKENED is active on the attacking combatant, the engine MUST halve
the damage that combatant deals, rounding down, after damage is calculated
(including any critical doubling) and before reaction mitigation.

#### Scenario: A weakened attacker deals half damage

- GIVEN the attacker has WEAKENED with roundsRemaining 1 and computed raw damage of 7
- WHEN WEAKENED is applied
- THEN the damage carried into mitigation is floor(7 / 2) = 3

### Requirement: A Magic Skill's Condition Applies Only on a Failed Save (R13)

The engine MUST apply a magic skill's `appliesCondition` to the defender only
when the saving throw fails. A successful save MUST NOT apply the condition,
even though the hit still deals half damage.

#### Scenario: Failed save applies the condition

- GIVEN VENOM_BOLT, defender's save fails
- WHEN the action resolves
- THEN POISONED is applied to the defender with roundsRemaining 3

#### Scenario: Successful save does not apply the condition

- GIVEN VENOM_BOLT, defender's save succeeds (half damage still dealt)
- WHEN the action resolves
- THEN POISONED is NOT applied to the defender

### Requirement: Re-applying an Active Condition Refreshes Its Duration (R16)

When a condition of a type already active on a combatant is applied again,
the engine MUST reset `roundsRemaining` to the new application's duration
rather than adding to it or leaving it unchanged, and MUST NOT create a
second condition row of the same type.

#### Scenario: A near-expiring condition is refreshed, not stacked

- GIVEN the defender already has POISONED with roundsRemaining 1
- WHEN hit again by VENOM_BOLT and the save fails
- THEN POISONED's roundsRemaining becomes 3, and only one POISONED entry exists for that combatant

### Requirement: A Condition Applied Mid-Round Has No Effect That Round (R17)

A condition applied during round N's resolution MUST NOT affect any roll
made later in round N by its bearer. It MUST begin affecting rolls starting
from round N+1's round-start tick.

#### Scenario: A same-round reaction is unaffected by a condition just applied

- GIVEN a combatant is hit by VENOM_BOLT in round 3 and fails the save, applying POISONED
- WHEN that combatant's reaction resolves later in round 3
- THEN POISONED does not impose disadvantage on that reaction's own rolls, if any

### Requirement: Round Start Is a Pure Function of State (Decision C)

The engine MUST expose round start as a pure function
`startRound(state) -> { state, events }` that decrements `roundsRemaining`
on every active condition by 1, removes any condition reaching 0 and emits
an expiration event for it, and sets `reactionAvailable = true` for the
combatant whose round is starting. The engine MUST NOT decide when this
function is invoked; the caller controls that.

#### Scenario: An active condition ticks down

- GIVEN WEAKENED with roundsRemaining 2
- WHEN startRound is called
- THEN roundsRemaining becomes 1 and the condition remains active

#### Scenario: A condition expires at round start

- GIVEN STUNNED with roundsRemaining 1
- WHEN startRound is called
- THEN the condition is removed and a `CONDITION_EXPIRED` event is emitted

#### Scenario: The acting combatant's reaction recharges

- GIVEN the acting combatant has `reactionAvailable: false`
- WHEN startRound is called for their turn
- THEN `reactionAvailable` becomes true in the returned state

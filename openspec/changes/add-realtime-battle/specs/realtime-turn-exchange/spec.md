# Realtime Turn Exchange Specification

## Purpose

Defines how the gateway orchestrates a round through the existing combat
engine: `battle:action` declares the sender's action, `battle:reaction`
declares the defender's answer, resolution runs through `resolveTurn`
exactly as the engine defines it (`combat-resolution`, `combat-reactions`,
`combat-turn-pipeline`, `combat-conditions` — unchanged, consumed as-is), the
per-round `startRound` tick advances the acting combatant, and each resolved
turn is written to the database with a guarantee that no round/sequence slot
is ever resolved twice. This capability reimplements none of the engine's
rules; it is a thin orchestration layer around them.

## Requirements

### Requirement: `battle:action` Declares the Sender's Action for the Current Round

The server MUST accept a `battle:action` naming an `ACTION`-type `skillCode`
from the battle's current `activeUserId`, subject to every validation of
`realtime-battle-session`.

#### Scenario: The active player's valid action is accepted

- GIVEN a battle `IN_PROGRESS` with `activeUserId` set to player A, and a
  `skillCode` in A's kit of type `ACTION`
- WHEN A emits `battle:action` with that `skillCode`
- THEN the action is recorded as declared for the current round, pending
  resolution

### Requirement: `battle:action` Opens a Reaction Window

Declaring a valid action MUST trigger the reaction window described by
`realtime-reaction-window`; the round does not resolve immediately on
`battle:action` alone.

#### Scenario: Declaring an action opens a window for the defender

- GIVEN the active player declares a valid action
- WHEN the action is accepted
- THEN the defending participant receives `battle:reaction_window`, and the
  round is not yet resolved

### Requirement: A Round Resolves Through `resolveTurn` Exactly Once

The server MUST call `resolveTurn` exactly once per round, passing the
declared action, the declared reaction (or `null` when none was declared or
the window expired), the frozen combatant state read from the database, and
`RANDOM_SOURCE` injected through the existing provider token — never
`Math.random()` and never a synthetic reaction constructed by the gateway.

#### Scenario: A declared reaction is passed to the engine

- GIVEN the defender declares a valid reaction before the window's deadline
- WHEN the round resolves
- THEN `resolveTurn` is called with that `DeclaredReaction`

#### Scenario: An expired window resolves with a null reaction

- GIVEN the reaction window expires with no reaction declared
- WHEN the round resolves
- THEN `resolveTurn` is called with `reaction: null`, not with a synthetic or
  inferred reaction

### Requirement: `battle:reaction` Declares the Defender's Answer Inside an Open Window

The server MUST accept a `battle:reaction` naming a `REACTION`-type
`skillCode` from the defending participant while their window is open,
subject to every validation of `realtime-battle-session`, and MUST trigger
resolution once accepted.

#### Scenario: A valid reaction inside the window triggers resolution

- GIVEN a defender with an open reaction window and a valid `REACTION`-type
  `skillCode` in their kit
- WHEN they emit `battle:reaction` with that `skillCode` before the deadline
- THEN the reaction is accepted and the round resolves through `resolveTurn`

### Requirement: `startRound` Ticks Exactly the Newly Active Combatant

The server MUST invoke `startRound` once per round transition, scoped to
only the combatant whose turn is starting, before `battle:round_start` is
emitted — matching the engine's own scoping (`combat-conditions`, Decision
F), which this capability orchestrates but does not redefine.

#### Scenario: A new round ticks only the newly active combatant

- GIVEN a round resolves and play passes to player B
- WHEN the next round begins
- THEN `startRound` is invoked with player B's combatant only, and player
  A's conditions and `reactionAvailable` are untouched by that call

#### Scenario: Clients are told whose turn it is

- GIVEN a new round has started for player B
- WHEN `battle:round_start` is emitted
- THEN both clients in the room receive it naming player B as the active
  player

### Requirement: Turn Persistence Writes a `BattleTurn` Row for Every Turn the Engine Returns

The server MUST persist every `TurnRecord` returned by `resolveTurn` as a
`BattleTurn` row scoped to that battle, preserving `round`, `sequence`,
`actorId`, `kind`, `skillCode`, `attackRoll`, `targetValue`, `hit`,
`critical`, and `damage` exactly as returned.

#### Scenario: Both emitted turn records are persisted

- GIVEN `resolveTurn` returns one `ACTION` and one `REACTION` turn record for
  the round
- WHEN the round's resolution is persisted
- THEN two `BattleTurn` rows exist for that battle, matching the returned
  records field for field

### Requirement: `BattleCombatant` State Reflects the Engine's Returned Combatants

The server MUST update both combatants' `currentHp` and `reactionAvailable`
on `BattleCombatant` to match the `actor` and `defender` returned by
`resolveTurn`.

#### Scenario: HP and reaction availability are persisted after resolution

- GIVEN `resolveTurn` returns an actor and defender with reduced `currentHp`
  and the defender's `reactionAvailable` now `false`
- WHEN the round's resolution is persisted
- THEN both combatants' `BattleCombatant` rows are updated to match

### Requirement: `ActiveCondition` Rows Mirror the Engine's Condition Events

The server MUST create or refresh an `ActiveCondition` row for every
`CONDITION_APPLIED` event, update `roundsRemaining` for every
`CONDITION_TICKED` event, and remove the row for every `CONDITION_EXPIRED`
event returned in the round's `events`.

#### Scenario: A newly applied condition is persisted

- GIVEN the round's events include `CONDITION_APPLIED` for POISONED on the
  defender
- WHEN the round's resolution is persisted
- THEN an `ActiveCondition` row of type POISONED exists for that combatant
  with the applied duration

#### Scenario: An expired condition is removed

- GIVEN the round's events include `CONDITION_EXPIRED` for a combatant's
  STUNNED condition
- WHEN the round's resolution is persisted
- THEN no `ActiveCondition` row of type STUNNED remains for that combatant

### Requirement: A Duplicate Resolution Attempt for the Same Slot MUST Be an Idempotent No-Op

When persisting a resolved round would violate the uniqueness of
`(battleId, round, sequence)` on `BattleTurn`, the server MUST treat the
violation as evidence that this exact turn was already resolved and MUST
re-emit the already-persisted result, never surfacing it as an error and
never writing a second pair of rows.

#### Scenario: Two concurrent deliveries for the same round resolve once

- GIVEN two messages that would both resolve the same battle's same round
  arrive close enough together that both pass validation before either
  persists
- WHEN both attempt to persist their turn rows
- THEN the first succeeds, the second's insert is rejected by the database's
  uniqueness constraint, and the second responds with the first's
  already-resolved result rather than an error

#### Scenario: A client's duplicate emission re-emits the same result

- GIVEN a client retries an already-processed `battle:reaction` for a round
  that has already resolved (a duplicate emission, e.g. a network retry)
- WHEN the duplicate is processed
- THEN the server re-emits the previously resolved `battle:turn_resolved`
  outcome instead of attempting a fresh resolution

### Requirement: `battle:turn_resolved` Carries the Complete Resolution

The server MUST emit `battle:turn_resolved` to both clients in the room
after a round resolves, carrying the rolls, hit/critical outcome, damage,
and resulting condition changes for that round.

#### Scenario: Both clients receive the identical resolution

- GIVEN a round resolves
- WHEN `battle:turn_resolved` is emitted
- THEN both participants' clients receive an identical payload describing
  that round's outcome

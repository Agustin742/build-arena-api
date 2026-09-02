# Realtime Reaction Window Specification

## Purpose

Defines the reaction window's lifecycle once `battle:action` opens it: its
15-second deadline, the two convergent resolution paths — an in-memory timer
for prompt UX and lazy evaluation on the next message for that battle, which
MUST reach the identical outcome — the guarantee that an expiring window
preserves the reaction rather than spending it, and the ordering guards
against a second reaction into the same window or a second action while the
actor's own window is still open. The database-persisted deadline is the
load-bearing mechanism; the in-memory timer is a comfort layer on top of it,
never the sole resolver of a window.

## Requirements

### Requirement: A Reaction Window Opens With a 15-Second Deadline

The server MUST open a reaction window with a deadline 15 seconds after the
triggering `battle:action` is accepted, and MUST notify the defending
participant of the deadline and which reaction types apply to the declared
action.

#### Scenario: A window opens with its deadline on a declared action

- GIVEN the active player declares a valid action
- WHEN the action is accepted
- THEN the defending participant receives `battle:reaction_window` naming a
  deadline 15 seconds out and the applicable reaction skill types

### Requirement: A Window Is Resolvable by Either the Timer or Lazy Evaluation, With the Same Outcome

The server MUST resolve an expired window through whichever of the two paths
reaches it first — the in-memory `setTimeout` while the process is alive, or
a lazy check performed before processing the next message for that battle —
and both paths MUST produce the identical resolution.

#### Scenario: The in-memory timer resolves the window while the process is up

- GIVEN a window's 15-second deadline passes while the server process is
  running uninterrupted
- WHEN the timer fires
- THEN the window resolves with `reaction: null`, without waiting for any
  further client message

#### Scenario: A lazy check resolves the window when the timer did not fire

- GIVEN a window's deadline has already passed but no in-memory timer
  resolved it (for example, the process restarted after the deadline)
- WHEN the next message for that battle arrives from either participant,
  including a reconnecting `battle:join`
- THEN the window is resolved lazily, with `reaction: null`, before that
  message is otherwise processed, reaching the identical outcome the timer
  would have produced

### Requirement: An Expiring Window MUST Preserve the Reaction, Not Spend It

Expiry MUST NOT consume the defending combatant's `reactionAvailable`; only
an actually declared and applied reaction spends it.

#### Scenario: An expired window leaves the reaction available

- GIVEN a defender with `reactionAvailable: true` and an open window that
  expires with no reaction declared
- WHEN the window resolves via expiry
- THEN `resolveTurn` is called with `reaction: null` and the defender's
  `reactionAvailable` remains `true` after the round's resolution is
  persisted, unaffected by the expiry itself

### Requirement: A Second `battle:reaction` for an Already-Closed Window MUST Be Refused

A window closes the instant a reaction is processed or an expiry resolution
completes, whichever happens first, and the server MUST refuse any further
`battle:reaction` for that same window as having no open window to answer.

#### Scenario: A second reaction attempt for the same window is refused

- GIVEN a defender who already declared a valid reaction that was accepted
  and resolved the round
- WHEN they emit a second `battle:reaction` for that same round
- THEN the second message is refused as having no open window, and no second
  resolution occurs

#### Scenario: A reaction sent after lazy expiry is refused

- GIVEN a window that has already been resolved by expiry (timer or lazy)
- WHEN the defender then emits `battle:reaction` for that same round
- THEN the message is refused as having no open window

### Requirement: A Second `battle:action` While the Actor's Own Window Is Still Open MUST Be Refused as Already Declared

Sending a second `battle:action` before the first one's reaction window has
closed MUST be refused with a reason distinguishable from V3's "not your
turn" — the sender is entitled to the turn but has already used it this
round.

#### Scenario: A repeated action in the same open round is refused

- GIVEN the active player already declared a valid action this round and its
  reaction window is still open
- WHEN that same player emits another `battle:action` before the window
  closes
- THEN the second message is refused as already declared this round, a
  reason distinct in content from a not-your-turn refusal

### Requirement: Resolving the Same Window Through Both Paths at Once MUST Be an Idempotent No-Op

When the in-memory timer and a lazy check both attempt to resolve the same
window at effectively the same time, exactly one resolution MUST be
persisted, and every path that observes the outcome MUST see that same
result — never a second `BattleTurn` pair and never an error surfaced to
either client.

#### Scenario: Timer and lazy path racing produce exactly one resolution

- GIVEN a window's deadline has passed and both the in-memory timer and a
  lazy check triggered by an incoming message attempt to resolve it at
  nearly the same time
- WHEN both attempts run
- THEN only one resolution is persisted (per `realtime-turn-exchange`'s
  idempotency requirement on the underlying `BattleTurn` write), and the
  path that lost the race surfaces the winning path's result rather than an
  error

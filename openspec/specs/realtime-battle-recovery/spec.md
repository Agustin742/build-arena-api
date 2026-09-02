# Realtime Battle Recovery Specification

## Purpose

Defines what a reconnecting client recovers through `battle:join` — the
complete database-backed state, including an open reaction window's
remaining time and the full resolved turn history — and the two independent
paths that close a battle, both setting `winnerId` and `endedAt`: hit points
reaching zero, and abandonment past a 2-minute disconnection deadline. The
database is the sole authority over this state; neither a client nor the
server's own memory is trusted to reconstruct it.

## Requirements

### Requirement: `battle:join` Returns the Complete State From the Database

The server MUST return, on every `battle:join` by a participant of a battle
`IN_PROGRESS` or already `FINISHED`, at minimum: status, `currentRound`,
`activeUserId`, both combatants' full frozen stat blocks, each combatant's
active conditions, and the resolved `BattleTurn` history ordered by round
and sequence.

#### Scenario: A reconnecting participant receives full state

- GIVEN a participant reconnects to a battle already `IN_PROGRESS` with two
  prior resolved rounds
- WHEN they emit `battle:join`
- THEN they receive status, `currentRound`, `activeUserId`, both combatants'
  frozen stat blocks, both combatants' active conditions, and both prior
  rounds' turn history in order

### Requirement: `battle:join` Includes an Open Reaction Window's Remaining Time

When a reaction window is open at the moment of the join, the returned state
MUST include that fact and how much time remains before its deadline; when
no window is open, the returned state MUST NOT imply one is.

#### Scenario: Reconnecting mid-window surfaces the remaining time

- GIVEN a reaction window opened 6 seconds ago on its 15-second deadline
- WHEN a participant emits `battle:join`
- THEN the returned state indicates a window is open with approximately 9
  seconds remaining

#### Scenario: Reconnecting with no open window shows none

- GIVEN no reaction window is open for the battle at the moment of the join
- WHEN a participant emits `battle:join`
- THEN the returned state indicates no window is open

### Requirement: Reconnecting Mid-Window Does Not Alter the Window's Outcome

A disconnection and reconnection during an open reaction window MUST NOT
change the window's deadline, reset it, or otherwise affect its resolution.

#### Scenario: A window's deadline survives a disconnect and reconnect

- GIVEN a participant disconnects while a reaction window addressed to them
  is open
- WHEN they reconnect before the window's original deadline
- THEN the window is still open on its original, unchanged deadline

### Requirement: A Disconnection Starts a 2-Minute Abandonment Deadline

The server MUST record that a participant disconnected from a battle
`IN_PROGRESS` and MUST notify the opponent, starting a 2-minute abandonment
deadline for the disconnected participant.

#### Scenario: The opponent is notified of a disconnection

- GIVEN a participant's socket disconnects while their battle is
  `IN_PROGRESS`
- WHEN the disconnection is processed
- THEN the opponent's client receives `battle:opponent_left`, and a
  2-minute abandonment deadline begins for the disconnected participant

### Requirement: Reconnecting Before the Abandonment Deadline Cancels It

A participant who reconnects and rejoins the battle before their 2-minute
abandonment deadline elapses MUST NOT have the battle closed against them,
and the deadline MUST no longer apply.

#### Scenario: A timely reconnect prevents abandonment closure

- GIVEN a participant disconnected 90 seconds ago from a battle still
  `IN_PROGRESS`
- WHEN they emit `battle:join` before the 2-minute deadline elapses
- THEN the battle remains `IN_PROGRESS`, no closure occurs, and the
  abandonment deadline no longer applies to them

### Requirement: Abandonment Past the Deadline Closes the Battle in the Surviving Player's Favor

The server MUST evaluate the abandonment deadline lazily, on the surviving
participant's next message for that battle — a `battle:join`,
`battle:action`, or `battle:reaction` — and, when the deadline has already
passed with no reconnection, MUST close the battle before processing that
message: setting `winnerId` to the surviving participant, `endedAt` to the
current time, and the status to `FINISHED`.

#### Scenario: The surviving player's next action closes an abandoned battle

- GIVEN a participant has been disconnected for more than 2 minutes from a
  battle still `IN_PROGRESS`, with no reconnection
- WHEN the surviving participant sends any message for that battle
- THEN the battle is closed first — `winnerId` set to the surviving
  participant, `endedAt` set to now, status `FINISHED` — before the
  surviving participant's message is otherwise processed, and both clients
  receive `battle:ended`

#### Scenario: A battle abandoned by both players stays open until someone acts

- GIVEN both participants have been disconnected for more than 2 minutes
  from a battle still `IN_PROGRESS`
- WHEN neither participant sends any further message for that battle
- THEN the battle remains `IN_PROGRESS` indefinitely, closing only once
  either participant next sends a message for it — an accepted limitation,
  not an oversight; no background sweep evaluates it

### Requirement: Closure by Hit Points Reaching Zero Sets `winnerId` and `endedAt`

When `resolveTurn` returns a non-null `defeatedId`, the server MUST close the
battle in the same resolution that persists the turn: setting `winnerId` to
the other combatant, `endedAt` to the current time, and the status to
`FINISHED`.

#### Scenario: A defeated combatant ends the battle

- GIVEN a round resolves and `resolveTurn` returns `defeatedId` naming the
  defender
- WHEN the round's resolution is persisted
- THEN the battle's status becomes `FINISHED`, `winnerId` is set to the
  attacker, `endedAt` is set to now, and both clients receive `battle:ended`
  naming the winner

### Requirement: A Closed Battle Refuses Further Messages

Once a battle is closed by either path, the server MUST refuse any further
`battle:action` or `battle:reaction` for it under `realtime-battle-session`'s
V2 (status must be `IN_PROGRESS`), regardless of whether the sending socket
is still a member of that battle's room.

#### Scenario: A message after closure is refused

- GIVEN a battle already closed by hit points reaching zero or by
  abandonment
- WHEN a participant emits `battle:action` or `battle:reaction` for it
- THEN the message is refused and no further turn is resolved

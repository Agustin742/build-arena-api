# Realtime Battle Session Specification

## Purpose

Defines the WebSocket gateway's authentication and authorization boundary:
handshake token verification before any room join, room admission limited to
a battle's two participants, the information-hiding property carried over
from REST for a non-participant refusal, and the seven per-message
validations (design `overview.md` §7) that are re-evaluated from the
database on every message. The socket inherits nothing from REST — it is a
separate attack surface (design §8.2) — and Socket.IO room membership is
never, by itself, treated as authorization.

## Requirements

### Requirement: A Connection Without a Valid Token Never Joins Any Room

The server MUST verify the handshake token against the same `JWT_SECRET`
used by the REST API before the connection is admitted to any room, and MUST
reject the connection outright — never merely deferring the check to the
first message — for an absent token, a malformed token, a token with an
invalid signature, and an expired token.

#### Scenario: A connection with no token is rejected

- GIVEN a client opens a socket connection with no `auth.token` at all
- WHEN the handshake is evaluated
- THEN the connection is rejected before any room join is possible, and the
  client never learns whether any battle exists

#### Scenario: A connection with a malformed token is rejected

- GIVEN a client's `auth.token` is not a well-formed JWT
- WHEN the handshake is evaluated
- THEN the connection is rejected before any room join

#### Scenario: A connection with an invalid signature is rejected

- GIVEN a client's `auth.token` is well-formed but was not signed with
  `JWT_SECRET`
- WHEN the handshake is evaluated
- THEN the connection is rejected before any room join

#### Scenario: A connection with an expired token is rejected

- GIVEN a client's `auth.token` was signed with `JWT_SECRET` but its `exp`
  claim is in the past
- WHEN the handshake is evaluated
- THEN the connection is rejected before any room join

### Requirement: `battle:join` Admits Only the Two Participants of That Battle

The server MUST re-read the battle's two participant IDs from the database
before admitting the authenticated socket to the room `battle:{battleId}`,
and MUST NOT rely on any client-supplied claim about participation.

#### Scenario: A participant is admitted to the room

- GIVEN an authenticated socket belonging to the battle's challenger or
  opponent
- WHEN it emits `battle:join` for that battle
- THEN it is admitted to room `battle:{battleId}` and receives the battle's
  state

#### Scenario: A non-participant is not admitted to the room

- GIVEN an authenticated socket belonging to a user who is neither the
  challenger nor the opponent of that battle
- WHEN it emits `battle:join` for that battle
- THEN it is not admitted to the room and receives a refusal instead of any
  battle state

### Requirement: A Non-Participant Refusal Is Indistinguishable From a Non-Existent Battle

The server MUST answer a `NOT_A_PARTICIPANT` refusal with the same generic
message and the same typed error event used for a `battleId` that does not
exist at all, preserving the REST design's information-hiding property over
a transport that has no HTTP status codes to lean on.

#### Scenario: Joining a non-existent battle produces the generic refusal

- GIVEN an authenticated socket
- WHEN it emits `battle:join` for a `battleId` that does not exist
- THEN it receives the same generic refusal content used for a real battle
  the sender is not part of

#### Scenario: Joining a real battle as a stranger produces the identical refusal

- GIVEN an authenticated socket belonging to a user who is not a participant
  of a real, existing battle
- WHEN it emits `battle:join` for that battle
- THEN it receives a refusal byte-for-byte identical in content to the
  non-existent-battle case, so the sender cannot distinguish the two

### Requirement: A Participant's Wrong-Status or Non-Entitlement Refusal MAY Be Specific

Once the sender is confirmed as a participant, the server MAY name the
specific reason a message is refused (`WRONG_STATUS`, `NOT_ENTITLED`, or an
equivalent per-validation reason), since the sender already knows the battle
exists and hiding the reason protects nothing.

#### Scenario: A participant's message for a not-yet-started battle names the reason

- GIVEN a participant of a battle still in status `ACCEPTED`
- WHEN they emit `battle:action` for it
- THEN they receive a refusal that names the specific reason, distinguishable
  in content from the generic non-participant refusal

### Requirement: V1 — Sender Identity and Participation Are Re-Checked From the Database on Every Message

The server MUST re-verify, from the database, that the sender is one of the
battle's two combatants on every `battle:action` and `battle:reaction`
message, not only at `battle:join` time.

#### Scenario: A previously-joined but now-invalid sender is refused

- GIVEN a socket that successfully joined a battle's room earlier in the
  session
- WHEN that socket's user is confirmed, on the database, to no longer be a
  participant of that battle at the moment a later message arrives
- THEN the later message is refused, even though the socket is still a
  member of the room

### Requirement: V2 — The Battle Must Be `IN_PROGRESS`

The server MUST re-read the battle's status from the database on every
message and MUST refuse `battle:action` and `battle:reaction` unless the
status is `IN_PROGRESS` at that moment.

#### Scenario: A message for a not-yet-started battle is refused

- GIVEN a battle in status `ACCEPTED`
- WHEN a participant emits `battle:action` for it
- THEN the message is refused and no turn is resolved

#### Scenario: A message for an already-finished battle is refused

- GIVEN a battle in status `FINISHED`
- WHEN a participant emits `battle:action` or `battle:reaction` for it
- THEN the message is refused and no turn is resolved, regardless of whether
  the sender's socket is still a member of that battle's room

### Requirement: V3 — It Must Be the Sender's Turn, Unless the Message Is a Reaction to an Open Window

The server MUST refuse `battle:action` from anyone other than the battle's
current `activeUserId`, and MUST admit `battle:reaction` from the defending
participant while their reaction window is open even though they are not
the active player.

#### Scenario: The non-active player's action is refused

- GIVEN a battle where `activeUserId` is player A
- WHEN player B emits `battle:action`
- THEN the message is refused as not their turn

#### Scenario: The defending participant's reaction is admitted despite not being active

- GIVEN a battle where `activeUserId` is player A and a reaction window
  addressed to player B is open
- WHEN player B emits `battle:reaction`
- THEN the message is admitted for validation, despite B not being the
  active player

### Requirement: V4 — The Declared Skill Must Belong to the Actor's Frozen Kit

The server MUST refuse a `battle:action` or `battle:reaction` whose
`skillCode` is not part of the sender's frozen build kit for that battle.

#### Scenario: A skill outside the actor's kit is refused

- GIVEN a combatant whose frozen kit does not include `skillCode`
  `FIREBALL`
- WHEN they declare `FIREBALL` as their action
- THEN the message is refused

### Requirement: V5 — The Skill Type Must Match the Moment

The server MUST refuse a `battle:action` whose declared skill is of type
`REACTION`, and MUST refuse a `battle:reaction` whose declared skill is of
type `ACTION`.

#### Scenario: A reaction-type skill declared as an action is refused

- GIVEN a skill of type `REACTION` in the actor's kit
- WHEN the actor declares it via `battle:action`
- THEN the message is refused

#### Scenario: An action-type skill declared as a reaction is refused

- GIVEN a skill of type `ACTION` in the defender's kit
- WHEN the defender declares it via `battle:reaction`
- THEN the message is refused

### Requirement: V6 — The Reaction Must Still Be Available This Round

The server MUST refuse a `battle:reaction` from a combatant whose
`reactionAvailable` is false at the moment the message is processed.

#### Scenario: A spent reaction is refused

- GIVEN a defending combatant with `reactionAvailable: false`
- WHEN they emit `battle:reaction`
- THEN the message is refused

### Requirement: V7 — No Turn May Already Be Recorded at That Round/Sequence Slot

The server MUST check, before persisting, that no `BattleTurn` row already
exists for the target round and sequence, and MUST treat the database's own
uniqueness guarantee on that pair as the final backstop rather than the
primary check (see `realtime-turn-exchange`'s idempotency requirement for
what happens when the backstop is the one that catches it).

#### Scenario: A slot with an existing turn is refused at the validation stage

- GIVEN a `BattleTurn` row already recorded for round 3, sequence 1 of a
  battle
- WHEN a message that would resolve into that same round and sequence is
  processed
- THEN the validation step detects the existing row and does not attempt a
  second resolution

### Requirement: Socket Room Membership Is Never Treated as Authorization

The server MUST re-run every applicable validation above from the database
on every message, and MUST NOT shortcut any of them on the basis that the
sending socket is currently a member of the battle's room.

#### Scenario: Room membership alone does not satisfy a validation

- GIVEN a socket that is a member of room `battle:{battleId}`
- WHEN that battle's status changes to `FINISHED` by another path while the
  socket remains in the room
- THEN the next message that socket sends for that battle is still refused
  by V2, exactly as if it had never joined the room

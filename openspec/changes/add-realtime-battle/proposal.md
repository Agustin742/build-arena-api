# Proposal: Real-time Battle (Phase 6)

## Intent

The fight exists but nobody can play it. Phase 3 built a pure engine that resolves a turn,
Phase 5 froze the combatants and opened the lifecycle up to `IN_PROGRESS` — and no route
ever fires the `START` transition, because the thing that was supposed to fire it does not
exist yet. Today two players can challenge and accept each other and then stare at a battle
that never begins.

The hard problem here is not the rules, it is the **order of the events**. A reaction window
is a moment where two clients, a deadline and a database all disagree about what has already
happened, and a badly specified one is discovered late and live. This change adds the
WebSocket gateway that drives a battle end to end, and makes the database — never a client,
never a socket, never a process's memory — the sole authority over what round it is, whose
turn it is, and whether a window is still open.

**Done when**: two clients fight from start to finish, and disconnecting and reconnecting one
of them recovers the combat at the exact point it left off.

## Scope

### In Scope

- New `src/ws/` gateway module built on `@nestjs/websockets` + `@nestjs/platform-socket.io`,
  pinned at **major 11** (see Dependencies).
- **Handshake authentication**: a connection without a valid token is rejected before it
  joins any room, ever. The socket does **not** inherit REST authorization — it is a separate
  attack surface (design §8.2), so it verifies the token itself against the same `JWT_SECRET`.
- One room per battle (`battle:{battleId}`), admitting only the two participants.
- Client events: `battle:join`, `battle:action`, `battle:reaction`.
- Server events: `battle:state`, `battle:round_start`, `battle:reaction_window`,
  `battle:turn_resolved`, `battle:ended`, `battle:opponent_left`, plus a typed error event so
  a refusal renders a message instead of a silent drop.
- **The seven validations of design §7, on every message, re-read fresh from the database.**
  Socket.IO room membership is never authorization:

| # | Validation |
|---|------------|
| V1 | Valid token, and the sender is one of the two combatants of that battle |
| V2 | The battle is `IN_PROGRESS` |
| V3 | It is the sender's turn, unless it is a reaction to an open window |
| V4 | The declared skill belongs to that build's kit |
| V5 | The skill type matches the moment: `ACTION` on your turn, `REACTION` in the window |
| V6 | The reaction is still available this round |
| V7 | No turn is already recorded at that round/sequence slot |

- **Reaction window with a 15-second deadline.** On expiry the reaction is **preserved, not
  spent**. The deadline is persisted in the database and evaluated lazily on the next message
  for that battle; an in-memory `setTimeout` is layered on top for prompt UX (see Approach).
- Turn persistence: each resolved turn writes its `BattleTurn` rows and updates
  `BattleCombatant` (`currentHp`, `reactionAvailable`); `ActiveCondition` rows mirror the
  engine's `CONDITION_APPLIED` / `CONDITION_TICKED` / `CONDITION_EXPIRED` events.
- **Reconnection**: `battle:join` returns the full state from the database — status, round,
  active player, both frozen stat blocks, active conditions, resolved turn history, and any
  open window with its remaining time.
- **Closure**, both paths setting `winnerId` and `endedAt`: hit points reaching zero
  (`resolveTurn`'s `defeatedId`), and abandonment past a **2-minute** deadline from
  disconnection, evaluated when the surviving player next acts.
- One `prisma/schema.prisma` migration on `Battle` for the pending-window and abandonment
  state (shape is an open question — see below).
- One WS e2e spec driving two `socket.io-client` connections; devDependency `socket.io-client`.

### Out of Scope

- Rating variation on `battle:ended` — Phase 7. The event carries the winner; the rating
  delta field stays absent until then.
- Any change to the combat engine's rules. `src/combat/` is consumed, never edited.
- Friendship or challenge notifications over the socket. Real, but not in the plan's scope.
- A background sweep job for abandoned battles. Closure is evaluated lazily; a battle both
  players abandon forever sits `IN_PROGRESS` until someone returns (accepted limitation).
- Server-pushed countdown ticks. The client computes its own countdown from the deadline.
- Redis, a socket adapter, or any multi-instance scaling. One instance, by design (§2.9).
- Balancing the numbers.

## Capabilities

### New Capabilities

- `realtime-battle-session`: handshake authentication, room admission, the seven per-message
  validations, and the mapping of `NOT_A_PARTICIPANT` / `WRONG_STATUS` / `NOT_ENTITLED` onto
  socket errors without leaking a battle's existence to a stranger.
- `realtime-turn-exchange`: the three client events and the six server events, action and
  reaction declaration, resolution through `resolveTurn`, and per-round `startRound` ticks.
- `realtime-reaction-window`: opening a window, the 15-second deadline, expiry preserving the
  reaction, single-resolution idempotency, and rejecting a second action or second reaction.
- `realtime-battle-recovery`: reconnection state assembly from the database, the 2-minute
  abandonment deadline, and closure by hit points at zero or by abandonment.

### Modified Capabilities

- None. The four Phase 3 combat specs stay exactly as they are; this change consumes the
  engine and changes none of its requirements.

## Approach

The gateway is a **thin orchestration layer**. It calls `applyTransition('START', ...)`,
`resolveTurn` and `startRound` and reimplements none of their logic — precisely what Phase 5
intended when it wrote the `START` row that no REST route fires. `RANDOM_SOURCE` is injected
through the existing provider token, never `Math.random()`.

Authentication is Socket.IO server-level middleware calling `JwtService.verifyAsync` against
`requireEnv('JWT_SECRET')`, reading the token from `handshake.auth.token` and rejecting the
connection before `handleConnection` runs. "No valid token, no room, ever" becomes structural,
not conventional. Reusing the Passport strategy was rejected: `ExtractJwt` expects an
Express-shaped `req`, and bridging a `Socket` into that shape is brittle for a two-line
`validate()`.

**The load-bearing timing mechanism is the database-persisted deadline, evaluated lazily.**
The in-memory `setTimeout` is a comfort layer on top of it, never the resolver of record.
This is not a preference; Render's free tier sleeps after 15 minutes without traffic, so an
in-memory-only timer dies with the process and leaves the turn hanging forever. Both paths
converge on the same guarded write, so **neither the timer nor the lazy path may be the sole
resolver of a window**. The idempotency guard already exists structurally —
`@@unique([battleId, round, sequence])` on `BattleTurn` — and a unique-constraint violation on
insert **MUST** be handled as an idempotent no-op that re-emits the already-resolved result,
never as a hard error.

Strict TDD. The persisted deadline is also what makes expiry honestly testable: a test
backdates the deadline with `prisma.battle.update(...)` instead of faking timers against real
socket I/O.

## Open Design Questions

Carried forward deliberately. The design phase decides these; this proposal does not.

| # | Question | Tradeoff already documented |
|---|----------|------------------------------|
| D1 | Shape of the new schema state for the pending reaction window and abandonment deadline: nullable columns on `Battle` (`pendingActionSkillCode`, `reactionDeadline`, `disconnectedUserId`, `disconnectDeadline`) vs. a separate 1:1 `BattlePendingTurn` table | Nullable columns fit the project's stated bias against premature abstraction (`architecture.md`, "not before three real cases") for one small piece of transient state; a side table avoids widening `Battle` with fields that are non-null only while a window is literally open |
| D2 | How `IN_PROGRESS -> FINISHED` is represented: a new row in `battle-transitions.ts` vs. an explicitly separate, clearly labeled closure path | The table today has **no** row reaching `FINISHED` — only ACCEPT, REJECT, CANCEL and START exist. A transition row keeps REST and WS reading one table, but `entitled` does not cleanly describe "the server decided". The risk to name either way: a gateway that hand-rolls a second, undocumented closure path that REST and WS silently disagree on later |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/ws/` | New | Gateway, auth middleware, per-message validation, turn persistence, state assembly |
| `prisma/schema.prisma` + one migration | **Modified (risky)** | New state on `Battle` for the open window and the abandonment deadline (D1) |
| `src/battle/rules/battle-transitions.ts` | Modified | Closure representation for `IN_PROGRESS -> FINISHED` (D2) |
| `src/battle/battle.service.ts` | Modified | A shared participant-scoped "load full battle state" read, instead of duplicating `involvingCaller` |
| `src/auth/` | Unchanged | Read-only; the WS path reuses `JWT_SECRET` + `@nestjs/jwt`, adding no auth logic to this module |
| `src/app.module.ts` | Modified | Register the new WS module |
| `src/combat/` | Unchanged | Consumed as-is |
| `package.json` | Modified | Three dependencies plus one devDependency (see Dependencies) |
| `test/` | New | One WS e2e spec requiring a real listener (`app.listen(0)`) |

## Risks

**Flagged risky per `openspec/config.yaml`**: this change **touches the Prisma schema** (a
migration on `Battle`) and **adds an authentication surface** (the socket handshake). Both are
called out explicitly here, and the rollback plan below is mandatory because of them.

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| The socket becomes an unguarded back door into all combat logic | Med | Reject at the handshake before any room join; re-run all seven validations from the database on every message; room membership is never treated as authorization |
| A lockfile pulls `@nestjs/websockets` or `@nestjs/platform-socket.io` at major 12 (pure ESM) and breaks the CommonJS build | **High** | Exact version pins at major 11, exactly as `@nestjs/jwt` 11.0.2, `@nestjs/passport` 11.0.5 and `@nestjs/swagger` 11.4.7 already required; `pnpm build` verified after install |
| Timer and lazy path both resolve the same window (double turn) | Med | Idempotent no-op on the `@@unique([battleId, round, sequence])` violation, re-emitting the resolved result; the guarded write is the single convergence point |
| The migration on `Battle` is wrong-shaped and needs a second migration | Med | D1 is decided in design before any code; the migration is additive and nullable, so an unused column is inert |
| The gateway hand-rolls a closure path REST later disagrees with | Med | D2 decided explicitly in design; whichever way it goes, it is documented and single-sourced |
| Event-ordering holes (double action, double reaction, stale socket, client retry) | Med | Each is specified as a named scenario, not left to the implementation: a second `battle:action` in an open window is "already declared this round" (distinct from "not your turn"); a second `battle:reaction` is "no open window" |
| Size exceeds the 400-line review budget | **High** | See Size Forecast; chained PRs planned by `sdd-tasks`, decision returned to the user (`ask-on-risk`) |
| A battle abandoned by both players sits `IN_PROGRESS` forever | Low | Accepted knowingly. Stated as a limitation, not an oversight; a sweep job is out of scope |
| Phase 6 runs long and the plan's control point triggers | Med | The plan already allows freezing this phase and shipping without real time; the in-memory timer is the first thing to cut, since the persisted deadline alone is correct |

## Rollback Plan

Three layers, in this order:

1. **Runtime**: unregister the WS module from `src/app.module.ts` and revert the change
   commits. Nothing in the REST API imports the gateway, so the deployed HTTP surface,
   authentication and CRUD keep working with the gateway gone — this is exactly what the
   plan's control point ("close the project without real time and it still passes") assumes.
2. **Schema**: the migration is **additive and nullable only** — new optional state on
   `Battle`, no column dropped, no type narrowed, no data backfilled. Rolling back the code
   leaves the columns in place and inert; no existing row becomes invalid. If the columns must
   go, a follow-up additive-down migration drops them, since no REST path reads them.
3. **Dependencies**: remove the three dependencies and the devDependency, run
   `pnpm install --frozen-lockfile` and `pnpm build`, and confirm `dist/main.js` is still at
   the root of `dist/`.

A battle already `IN_PROGRESS` when the gateway is removed stays `IN_PROGRESS` with its turns
intact — the data is not corrupted, only unplayable, and the same battle resumes if the
gateway comes back.

## Size Forecast

Measured against a **400 logic-line** review budget (`src/**/*.ts`, excluding `*.spec.ts`),
strict TDD on. Line forecasts in this project run low because of Prettier; a ~40% cushion is
already applied.

| Part | Estimate |
|------|----------|
| Gateway, auth middleware, validations, persistence, state assembly (`src/ws/**`) | ~500–650 |
| `battle.service.ts` shared read + `battle-transitions.ts` closure | ~60–100 |
| Prisma schema + migration | ~20 |
| Tests (unit + one WS e2e) | ~600–900 |
| **Total logic** | **~580–770** |

**Roughly 1.5–2× the budget.** `sdd-tasks` owns the slicing decision; the natural seams follow
the plan's own suggested commits (handshake auth → rooms and join → action resolution →
reaction window → turn persistence → reconnect and closure). Under `ask-on-risk` this returns
to the user before apply.

## Dependencies

| Package | Kind | Constraint |
|---------|------|------------|
| `@nestjs/websockets` | dependency | **Pinned at major 11. Never 12** — major 12 is pure ESM and breaks this NestJS 11 + CommonJS build |
| `@nestjs/platform-socket.io` | dependency | **Pinned at major 11. Never 12** — same reason |
| `socket.io` | dependency | Version compatible with the platform adapter above |
| `socket.io-client` | devDependency | WS e2e only |

Blocking prerequisites: none. Phases 3 and 5 are complete and green — the engine, the
transition table, the frozen combatants and `RANDOM_SOURCE` are all already in place.
Downstream: Phase 7 reads `winnerId` / `endedAt` to compute rating and fills the rating delta
in `battle:ended`.

## Success Criteria

- [ ] A connection without a valid token never joins a room, and never learns whether a
      battle exists.
- [ ] All seven §7 validations run on every message, re-read from the database — no decision
      relies on socket room membership.
- [ ] Two clients fight a battle from `ACCEPTED` to `FINISHED` end to end.
- [ ] Disconnecting and reconnecting a client recovers the combat at the exact point it left
      off, including an open reaction window and its remaining time.
- [ ] A reaction window expiring **preserves** the reaction; the combatant still has it.
- [ ] Resolving the same window twice (timer plus lazy path, or a client retry) produces
      exactly one pair of `BattleTurn` rows and re-emits the same result.
- [ ] A battle closes with `winnerId` and `endedAt` set on hit points reaching zero, and on
      abandonment past the 2-minute deadline.
- [ ] `@nestjs/websockets` and `@nestjs/platform-socket.io` resolve at major 11 in the
      lockfile.
- [ ] `pnpm test`, `pnpm test:e2e`, `pnpm lint` and `pnpm build` pass, with `dist/main.js` at
      the root of `dist/`.

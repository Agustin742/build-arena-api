# Exploration: Real-time battle over WebSocket (Phase 6, `add-realtime-battle`)

Investigation only. No implementation, no branch, no requirements decided here.

Sources read: `docs/design/implementation-plan.md` (Fase 6), `docs/design/architecture.md` (§7, §8.2), `docs/design/combat-engine.md`, `docs/design/overview.md` (§4.6, §5, §7, §8.2), the four archived Phase 3 specs (`combat-resolution`, `combat-conditions`, `combat-reactions`, `combat-turn-pipeline`), `src/combat/**` (types.ts, turn.ts, index.ts, state/round.ts, state/reactions.ts), `src/battle/**` (battle.service.ts, rules/battle-transitions.ts, rules/combatant-freeze.ts), `src/common/random-source.token.ts`, `src/common/public-player.ts`, `src/auth/**` (jwt.strategy.ts, token.service.ts, auth.module.ts, authenticated-user.ts), `src/common/guards/jwt-auth.guard.ts`, `src/common/env.ts`, `prisma/schema.prisma`, `prisma/migrations/**`, `test/battle-lifecycle.e2e-spec.ts`, `test/jest-e2e.json`, `package.json`, `pnpm-workspace.yaml`, `openspec/config.yaml`, and the archived Phase 3 `exploration.md` for format precedent.

## Current State

- `src/combat/` is a complete, pure, framework-free engine. `resolveTurn(input: TurnInput): TurnResolution` is the single entry point Phase 6 must call: it takes `{ round, actor, defender, action, reaction: DeclaredReaction | null, random }` and returns `{ actor, defender, turns: TurnRecord[1|2], events: CombatEvent[], defeatedId }`. `startRound(input: { round, actor }): { actor, events }` handles the per-round tick (condition decrement/expiry, reaction recharge) but is scoped to ONE combatant at a time (Decision F) — the gateway must call it once per combatant whose turn is starting. Neither function mutates its inputs or reads a clock; timing is entirely the gateway's problem.
- `RANDOM_SOURCE` (`src/common/random-source.token.ts`) is already a NestJS provider token (`useClass: SystemRandomSource`). The WS module must inject it the same way `battle.service.ts` does (`@Inject(RANDOM_SOURCE)`), never call `Math.random()` or construct `SystemRandomSource` directly.
- `battle-transitions.ts` already has `START: { from: ACCEPTED, to: IN_PROGRESS, entitled: 'EITHER' }` and an exported `applyTransition(transition, battle, actorId)`. It has NO entry for `IN_PROGRESS -> FINISHED` — closure is an open gap (see Q6). `isParticipant`/`SIDE_OF`/`ROLE_NAME` are private to that file; the gateway needs its own participant-scoped read (mirroring `battle.service.ts`'s `involvingCaller`), not a new copy of the entitlement logic.
- Auth today is REST-only: `JwtStrategy` (passport-jwt) extracts the bearer from `req.headers.authorization` via `ExtractJwt.fromAuthHeaderAsBearerToken()`, validates against `requireEnv('JWT_SECRET')`, and `JwtAuthGuard` (extends `AuthGuard('jwt')`) is applied globally with a `@Public()` escape hatch. This guard is HTTP-request-shaped; it does not transparently work against a `Socket` object. `TokenService` and `JwtStrategy` each independently call `requireEnv('JWT_SECRET')` — duplicating the *lookup*, not the *logic* — which is already the codebase's existing pattern for "two independent verifiers, same env var," and Phase 6 can follow it rather than invent shared-guard plumbing.
- `AuthModule` only exports `TokenService`, not `JwtService` or `JwtModule`. A WS module needs its own way to verify tokens.
- `prisma/schema.prisma`: `Battle` already has `currentRound`, `activeUserId`, `status`, `startedAt`, `endedAt`, `winnerId` — enough to track whose turn it is and to close a battle. It has **no column for an open reaction window** (no pending skill code, no deadline) and **no column for a disconnect/abandonment deadline**. `BattleCombatant` has `currentHp`, `reactionAvailable`, and a `conditions: ActiveCondition[]` relation — exactly the per-combatant state `resolveTurn`/`startRound` mutate. `BattleTurn` has one row shape matching `TurnRecord` exactly, with `@@unique([battleId, round, sequence])` already acting as a structural duplicate-write guard.
- `package.json` has no `@nestjs/websockets`, `@nestjs/platform-socket.io`, or `socket.io` dependency yet — this phase is greenfield for the gateway itself. `@nestjs/jwt` 11.0.2, `@nestjs/passport` 11.0.5 are already pinned at major 11; the new WS packages MUST be pinned there too (major 12 is pure ESM, breaks this CommonJS build — this is a repeated, explicit project trap).
- `test/battle-lifecycle.e2e-spec.ts` establishes the e2e pattern this phase must extend: `Test.createTestingModule({ imports: [AppModule] }).compile()`, `app.createNestApplication()`, `app.init()` — but it never calls `app.listen()`, since supertest talks to `app.getHttpServer()` in-process. A `socket.io-client` cannot do that; it needs a real TCP listener, which is a genuine new requirement this phase introduces (see Q8). Teardown order is confirmed: delete `Battle` rows (`ON DELETE RESTRICT` from `User`) before deleting `User` rows; `BattleCombatant`/`ActiveCondition`/`BattleTurn` all cascade from `Battle`.

## Affected Areas

- `src/ws/` (new) — gateway module: handshake authentication, room join, the three client events, the seven per-message validations, turn persistence, reconnection state assembly, closure.
- `src/battle/rules/battle-transitions.ts` — needs a `FINISH` (or equivalent) transition entry so REST and WS keep reading the same table; currently only ACCEPT/REJECT/CANCEL/START exist.
- `src/battle/battle.service.ts` — likely gains a shared, participant-scoped "load full battle state" read method the gateway can reuse instead of duplicating `involvingCaller`.
- `prisma/schema.prisma` — needs new nullable columns (see Q4) for the open reaction window and the disconnect/abandonment deadline; a migration is required.
- `src/auth/` — read-only for this phase (no changes expected), but its `requireEnv('JWT_SECRET')` + `@nestjs/jwt` pattern is exactly what the WS auth mechanism should reuse.
- `test/` — one new `*.e2e-spec.ts` driving two `socket.io-client` connections against a really-listening app instance; devDependency `socket.io-client` needed.
- `package.json` — new dependencies `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (all pinned major 11 for the first two).

## Approaches

### Q1 — Handshake authentication

| Approach | Pros | Cons | Effort |
| --- | --- | --- | --- |
| Reuse `AuthGuard('jwt')` (Passport) via a WS `ExecutionContext` adapter | Same Strategy class as REST | Passport-jwt's `ExtractJwt` expects an Express-like `req`; bridging a `Socket` into that shape is brittle and undocumented for this exact combination; not worth it for a 2-line `validate()` | High |
| Custom `WsJwtGuard`/service reusing `JwtService.verifyAsync` + `requireEnv('JWT_SECRET')`, invoked in `handleConnection` | Single source of truth is the secret + `@nestjs/jwt`, matching the existing "two verifiers, same env var" pattern already in the repo; works uniformly for `handleConnection` and later revalidation | Duplicates the trivial payload→`AuthenticatedUser` mapping (1 line) unless factored into a shared pure function | Low |
| Socket.IO server-level middleware (`server.use(...)` in `afterInit`) doing the same verification, rejecting the connection with `next(new Error(...))` before it ever joins | Rejects the connection before `handleConnection` runs at all — "no valid token, no room, ever" is enforced structurally, not by convention | None significant | Low |

Recommendation: server-level Socket.IO middleware calling `JwtService.verifyAsync` against `requireEnv('JWT_SECRET')`, extracting the token from `handshake.auth.token` (the standard socket.io v4 client convention: `io(url, { auth: { token } })`), attaching `{ id, username }` to `socket.data.user`. Do not attempt to reuse the Passport Strategy object itself — its logic is two lines and re-implementing verification via `JwtService` directly keeps a single verification call, not a shared class. **Hard constraint: pin `@nestjs/websockets` and `@nestjs/platform-socket.io` at major 11, never 12** (ESM-only, breaks this CommonJS build) — this is carried over directly from the Phase 6 handoff and must not be silently upgraded by a lockfile resolution.

### Q2 — Room membership and error mapping

One room per battle (`battle:{battleId}`), joined only after the participant check passes. The check itself should reuse the exact query shape `battle.service.ts` already uses (`findFirst({ where: { id, OR: participantClause(currentUserId) } })`), not a copy of `applyTransition`'s private `isParticipant`. `applyTransition` answers "may this transition happen," not "is this room join valid" — those are different questions that happen to share the same underlying `NOT_A_PARTICIPANT` reason.

Socket.IO has no HTTP status codes, so the REST 404-vs-403 split must be re-expressed as message content, not status: `NOT_A_PARTICIPANT` maps to the SAME generic message REST uses ("Battle not found" or equivalent) and refuses the room join without ever confirming the battle's existence or status — this preserves the REST design's information-hiding property. `WRONG_STATUS`/`NOT_ENTITLED` can be more specific (the caller already knows they're a participant, exactly as the REST 403 rationale states) and should surface via a `WsException`/typed error event (e.g. `battle:error`) rather than a bare `disconnect()`, so the client can render a real message instead of a silent drop.

### Q3 — The reaction window (the crux)

| Approach | Reconnection recovery | Free-tier sleep/single instance | Jest testability | Process restart mid-window |
| --- | --- | --- | --- | --- |
| In-memory timer only (`setTimeout` in the gateway) | Lost entirely — nothing on disk records that a window was ever open; a reconnecting client sees no trace of it | Fine while awake, but the window itself has no persistence, so it's fragile independent of sleep | Requires fake timers mixed with real socket I/O in the same test — the two are notoriously unreliable together | Battle hangs forever: no timer survives, nothing ever resolves that turn again |
| Deadline + pending action persisted on `Battle`, evaluated lazily on the next message for that battle (including a reconnecting `battle:join`) | Full — a reconnect just reads the column | Excellent — nothing needs the process to be "awake" for the deadline itself; resolution happens reactively when someone sends a message | Excellent — a test can backdate the persisted deadline directly via `prisma.battle.update(...)` instead of waiting or faking timers | Nothing is lost; the next message from either side (even after a full restart) resolves the pending turn as "reaction conserved" |
| Hybrid: in-memory timer for snappy UX while both are connected, DB deadline as the durable fallback | Full, via the DB half | Fine — the timer is a bonus, not a dependency | Good, but needs an idempotency guard so the timer and a lazy check can't both try to resolve the same turn (the `BattleTurn` unique constraint already provides this) | Nothing is lost; only the "prompt" UX degrades to "resolves on next message" if the timer died with the process |

Recommendation: **DB-persisted deadline, evaluated lazily, as the load-bearing mechanism.** This is the only option that survives a process restart without any extra machinery, and it is the one a Jest e2e test can exercise honestly without faking timers. Add the in-memory `setTimeout` only as an optional UX nicety layered on top once the lazy path is proven — and explicitly treat it as **the first thing to cut** if Phase 6 runs long, per the plan's own control point. The tradeoff stated plainly: without the in-memory timer, a window that nobody is watching only visibly resolves when the NEXT message for that battle arrives (from either side), not at the exact deadline instant — a real but bounded UX cost, not a correctness cost, and it is fully consistent with §2.9's "no memory, no Redis, one instance" design thesis.

### Q4 — Turn persistence and schema gap

Per resolved turn, `BattleTurn` gets exactly `resolveTurn()`'s `TurnRecord` fields (`round`, `sequence`, `actorId`, `kind`, `skillCode`, `attackRoll`, `targetValue`, `hit`, `critical`, `damage`) for both emitted rows — `skipped` has deliberately no column (per the type's own comment: `skillCode: null` already disambiguates a lost turn). `BattleCombatant` gets `currentHp` and `reactionAvailable` updated from the returned `actor`/`defender`, and `ActiveCondition` rows are upserted/deleted to mirror the `CONDITION_APPLIED`/`CONDITION_TICKED`/`CONDITION_EXPIRED` events.

The schema as it stands does **not** support the open-window/abandonment state Phase 6 needs — a migration is required. Concrete candidates for the design/proposal phase to decide between:

- New nullable columns directly on `Battle`: `pendingActionSkillCode: String?` (the declared action awaiting a reaction decision — the actor is already known via `activeUserId`, so no new actor column is needed), `reactionDeadline: DateTime?`, and a disconnect pair `disconnectedUserId: String?` + `disconnectDeadline: DateTime?` for abandonment closure.
- A separate 1:1 `BattlePendingTurn` table instead of widening `Battle` with fields that are non-null only while a window is literally open.

Given the project's own stated bias against premature abstraction (`architecture.md` §"Cuándo abstraer" — not before three real cases) and that this is exactly one small, well-bounded piece of transient state, nullable columns on `Battle` look like the better fit, but this is a genuine design-phase decision, not settled here.

### Q5 — Reconnection: what "full state" means

`battle:join` must return, at minimum: `status`, `currentRound`, `activeUserId`, both combatants' full frozen stat block (attributes, `armorClass`, `maxHp`, `currentHp`, `initiative`, `reactionAvailable` — revealing this to the other combatant is already authorized per the design's authorization matrix, "Ver la del rival: Solo si es combatiente de una batalla que compartís"), each combatant's active `ActiveCondition` rows, and the resolved `BattleTurn` history for that battle (already durable and orderable by `round`/`sequence` — this is also the replay feature §2.9 promises for free).

What is currently NOT persisted and would bite a reconnecting client under an in-memory-only design: the fact that a reaction window is even open, and how much time is left in it. Without the Q4 schema addition, a reconnecting client mid-window sees a battle that looks like it's simply waiting on someone, with no way to know a window exists at all — this is the concrete failure mode the mission statement is warning about.

### Q6 — Battle closure

Two independent paths, both terminating in `IN_PROGRESS -> FINISHED` with `winnerId` and `endedAt` set:

1. **HP reaches zero** — `resolveTurn`'s `defeatedId` already signals this; the gateway reads it directly off the return value, no new engine logic needed.
2. **Abandonment past a deadline** — needs the disconnect/deadline columns from Q4. Unlike the reaction window, this closure is NOT self-forcing: a reaction window is naturally re-evaluated by the current actor's own next message, but if BOTH players leave forever, nothing will ever emit another message for that battle, so a purely lazy "check on next message" would never fire. The honest, single-instance-friendly answer is to evaluate abandonment lazily whenever the SURVIVING player does anything for that battle (a later reconnect via `battle:join`, or any other action) rather than running a background sweep interval — deferring closure until someone actually cares, which fits a free-tier instance that is allowed to sleep between battles.

Neither closure path is representable by the current `battle-transitions.ts` table (`REJECTED`/`CANCELLED` are reachable only from `PENDING`; nothing reaches `FINISHED`). Whether to model this as a new `FINISH` transition row (awkward, because "entitled" doesn't cleanly describe "the engine/server decided" the way it describes a player action) or as a direct update outside `applyTransition` is a genuine open design question, not resolved here — flagged explicitly so the design phase does not silently duplicate transition logic outside the shared table.

### Q7 — Event ordering hazards to answer explicitly

- Two actions arriving at once: validation #3 (only the active player's turn) plus validation #7 (no turn already in that round+sequence slot) plus the DB unique constraint as the hard backstop; a unique-violation on insert must be handled as an idempotent no-op, not a hard error.
- An action arriving during an open reaction window: this is the actor sending a second `battle:action` while their own already-declared action is still awaiting the defender's reaction — must be rejected as "already declared this round," a case the seven validations need to name explicitly (it is subtly different from "not your turn").
- A reconnect mid-window: solved by the Q3/Q4 persisted deadline + pending skill code.
- A client emitting for a battle it already left (finished, or a stale socket after being defeated, or reconnected into a different battle's room): every message must re-validate participant + status fresh from the database — Socket.IO room membership carries no authorization semantics of its own and must never be trusted alone.
- Duplicate emissions (client retry, double-submit): same unique-constraint idempotency guard as above, ideally re-emitting the already-resolved turn's result rather than surfacing an error.
- A double reaction (client sends `battle:reaction` twice, trying to change its mind): the window must be considered closed the instant a reaction (or the lazy expiry) is processed; a second `battle:reaction` for the same round must be rejected as "no open window."

### Q8 — Test strategy

The existing e2e pattern (`Test.createTestingModule({ imports: [AppModule] }).compile()` + `app.init()`, no `listen()`) works for supertest because it talks to `app.getHttpServer()` in-process, but a `socket.io-client` needs a real TCP listener. The WS e2e test must call `await app.listen(0)` (OS-assigned port) and read the bound address to build the connection URL — a genuine, new pattern this phase introduces, not a break of an existing convention.

Smallest honest integration test: reuse the exact REST setup `battle-lifecycle.e2e-spec.ts` already has (register two users, create builds, challenge, accept) up through `ACCEPTED`, override `RANDOM_SOURCE` in the `TestingModule` with a `SequenceRandomSource` (never stub `Math.random`), then: both clients connect with their access tokens and emit `battle:join` (asserting `IN_PROGRESS` after the gateway fires `applyTransition('START', ...)`); the active player emits `battle:action` and the defender receives `battle:reaction_window`; the defender emits `battle:reaction` and both receive a deterministic `battle:turn_resolved`; one client disconnects and reconnects with a fresh `socket.io-client` using the same token, emits `battle:join` again, and the returned state must match exactly what was left off (proving DB-backed recovery, not memory). A deadline-expiry case can be tested without any real wait by backdating the persisted `reactionDeadline` directly through `prisma.battle.update(...)` before sending the next message — this is itself evidence in favor of the Q3 recommendation, since a bare in-memory timer would force either a real multi-second sleep in the test or monkeypatching `setTimeout`, both worse.

## Recommendation

Build the gateway as a thin orchestration layer that calls `applyTransition`, `resolveTurn`, and `startRound` and reimplements none of their logic — exactly as the Phase 5 authors intended when they added the `START` row. Authenticate the handshake with Socket.IO server middleware calling `JwtService.verifyAsync` against the same `JWT_SECRET`. Persist the reaction deadline and pending action on `Battle` (new nullable columns, one migration) and evaluate expiry lazily on the next message for that battle — add an in-memory timer only as an optional, first-to-cut UX layer on top. Extend `battle-transitions.ts` with a closure entry (or an explicitly separate, clearly-labeled closure path) rather than hand-rolling status flips inside the gateway. Every message re-validates participant, status, turn, skill-kit membership, and prior-slot occupancy fresh from the database — never trusting socket-side room membership as authorization.

**Smallest viable slice** (if Phase 6 runs long): handshake auth + room join + `battle:action`/`battle:reaction` resolved through the engine + `BattleTurn`/`BattleCombatant` persistence + `battle:join`-based reconnection reading DB state, all WITHOUT the in-memory timer (lazy-only reaction expiry) and WITHOUT a background abandonment sweep (lazy-on-next-message closure only). What can be deferred without contradicting the plan's control point: proactive server-pushed countdown ticks for the reaction window (the client can compute its own countdown from the deadline it received), and any scheduled abandonment sweep — both are UX polish, not correctness, under the DB-deadline design.

## Risks

- Pinning `@nestjs/websockets`/`@nestjs/platform-socket.io` at major 11 requires an explicit version pin in `package.json`; a bare `^`/`latest` install could silently pull major 12 and break the CommonJS build the same way `@nestjs/jwt`/`@nestjs/passport`/`@nestjs/swagger` already had to be pinned.
- The schema migration (Q4) touches `Battle`, which `openspec/config.yaml` already flags as a change that must be marked risky in the proposal.
- Closure-by-abandonment has no self-forcing trigger if both players disappear forever; choosing "evaluate lazily on the surviving player's next action" means an abandoned battle can sit `IN_PROGRESS` indefinitely with no one to notice — acceptable for grading/demo scope, but worth stating explicitly as an accepted limitation rather than an oversight.
- `battle-transitions.ts` has no representation for `IN_PROGRESS -> FINISHED`; if the design phase doesn't extend it, there's a real risk of the gateway hand-rolling a second, undocumented transition path that REST and WS silently disagree on later (e.g. if a future REST endpoint ever needs to force-close a battle).
- The WS e2e test needs a real listening port (`app.listen(0)`), which is new relative to every existing e2e spec; this is a process change worth calling out explicitly in tasks so it isn't mistaken for a mistake during review.

## Ready for Proposal

Yes, with two named open design questions carried forward explicitly rather than silently decided:

1. Exact new column names/table shape for the pending reaction window and abandonment deadline (Q4).
2. How `IN_PROGRESS -> FINISHED` is represented in `battle-transitions.ts` (Q6).

Both are proposal/design-phase decisions with real but bounded tradeoffs already laid out above; nothing here blocks writing the proposal.

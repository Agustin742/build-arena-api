# Tasks: Real-time Battle (Phase 6)

Change: `add-realtime-battle`. Inputs: `proposal.md`, `design.md` (D1/D2 settled), `specs/*`
(4 capabilities, 36 requirements, 52 scenarios), Engram 256 (Phase 6 handoff traps), Phase 3
precedent `openspec/changes/archive/2026-08-31-add-combat-engine/tasks.md`. Strict TDD: every
implementation task is preceded by the task that writes its failing test.

## Review Workload Forecast

The proposal's own logic-line forecast is **~580–770** against a **400-line** budget (1.5x–2x
over), already carrying a 40% Prettier cushion. Phase 3's precedent measured actuals up to ~3x
its per-slice estimate (slice 3: ~140 est -> 424 actual). To absorb that historical miss factor
without a retroactive split, this plan uses **finer seams than the proposal's six commits**,
aligning close to one `src/ws/` file per slice for the two largest/most novel files
(`message-checks.ts`, `turn-resolution.service.ts`) instead of bundling them with their callers.

| Slice | Branch | Base | Contains | Logic est. (cushioned) | Fits 400? |
|---|---|---|---|---|---|
| 0 | `feat/add-realtime-battle` | `main` | SDD docs; D1 migration; D2 closure; `participant-clause.ts`; `findForParticipant` | 80–120 | Yes |
| 1 | `feat/ws-handshake-auth` | slice 0 | `ws.module.ts`, `ws-auth.middleware.ts`, `battle-events.ts` (partial), `battle.gateway.ts` (skeleton), `app.module.ts`, deps | 75–100 | Yes |
| 2 | `feat/ws-message-checks` | slice 1 | `rules/message-checks.ts` alone — the seven validations, `authorize()`, completeness guard | 150–210 | Yes |
| 3 | `feat/ws-battle-rooms` | slice 2 | `battle-session.service.ts` (partial: load, authorize entry), `battle.gateway.ts` `battle:join`, `battle-events.ts` join/state types | 75–100 | Yes |
| 4 | `feat/ws-turn-resolution` | slice 3 | `turn-resolution.service.ts` full — claim, engine call, persistence, idempotency, concurrency test, closure | 170–240 | Yes (watch closely) |
| 5 | `feat/ws-action-wiring` | slice 4 | `battle.gateway.ts` `battle:action`/`battle:reaction` handlers, `battle-events.ts` extend | 45–65 | Yes |
| 6 | `feat/ws-reaction-timeout` | slice 5 | `reaction-timer.registry.ts`, `battle-session.service.ts` `settleOverdue` (reaction branch), wiring | 55–75 | Yes |
| 7 | `feat/ws-battle-recovery` | slice 6 | `battle-session.service.ts` full state assembly, disconnect handling, abandonment branch of `settleOverdue`, `battle-events.ts` `opponent_left` | 75–95 | Yes |
| **Total** | | | | **~725–1005 range (mid ~730)**, within proposal's cushioned band | — |

Every slice lands comfortably under 400 even at the upper bound. The two named risk points are
slice 4 (`turn-resolution.service.ts` is the single largest, most novel file — the transactional
claim, the idempotent no-op, and the concurrency test all live there) and slice 2
(`message-checks.ts` carries the seven validations with load-bearing comments). **If either
slice's measured diff approaches 400, split it at its own internal seam before opening the PR,
not after review flags it**: slice 2 has no natural internal split (one declared array, kept
atomic on purpose per design); slice 4 splits at the claim+persist boundary (`resolve()` core,
tasks 4.1–4.6) vs. concurrency+idempotency (tasks 4.7–4.10) if it must.

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

Delivery strategy: `ask-on-risk` — the orchestrator returns this forecast to the user before
`sdd-apply` starts. Each branch is cut from the previous one; each PR targets the previous PR's
branch, not `main` — GitHub defaults every new PR's base to `main`, so **the base must be
changed by hand on GitHub for every slice after slice 0**. There is no `gh` CLI in this
environment; every PR is opened by hand at
`https://github.com/Agustin742/build-arena-api/pull/new/<branch>`.

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 0 | Schema + closure + shared read foundation | PR 0 | `pnpm test src/battle` | N/A — no REST route reads the new columns yet | Revert PR 0; four `DROP COLUMN`s; `src/battle/rules/{battle-transitions,participant-clause}.ts` |
| 1 | Handshake auth, module wiring | PR 1 | `pnpm test src/ws` | `pnpm test:e2e -- battle-realtime` (tokenless-connection scenario) | Unregister `WsModule` from `app.module.ts`; delete `src/ws/` |
| 2 | Seven validations, declared once | PR 2 | `pnpm test src/ws/rules` | N/A — pure functions, no socket I/O | Revert PR 2; delete `src/ws/rules/message-checks.ts` |
| 3 | Rooms + `battle:join` | PR 3 | `pnpm test src/ws` | `pnpm test:e2e -- battle-realtime` (join/refusal scenarios) | Revert PR 3; `battle-session.service.ts` load/authorize entry |
| 4 | The single transactional resolver | PR 4 | `pnpm test src/ws/turn-resolution.service` | N/A at unit level; concurrency test uses the real DB via `pnpm test` | Revert PR 4; delete `turn-resolution.service.ts` |
| 5 | Action/reaction handlers wired to the resolver | PR 5 | `pnpm test src/ws` | `pnpm test:e2e -- battle-realtime` (full round) | Revert PR 5; gateway handlers only |
| 6 | Reaction window timeout | PR 6 | `pnpm test src/ws` | `pnpm test:e2e -- battle-realtime` (expiry preserves reaction) | Revert PR 6; delete `reaction-timer.registry.ts`; `settleOverdue` reaction branch |
| 7 | Reconnect + abandonment closure | PR 7 | `pnpm test src/ws` | `pnpm test:e2e -- battle-realtime` (reconnect, abandonment) | Revert PR 7; `settleOverdue` abandonment branch, disconnect handling |

---

## Slice 0 — `feat/add-realtime-battle` (base: `main`)

- [ ] 0.1 Commit SDD artifacts already on disk (`proposal.md`, `specs/*`, `design.md`,
      `tasks.md`) to this branch. `docs(ws): add sdd proposal spec and design for realtime battle`
- [ ] 0.2 Impl: `prisma/schema.prisma` — add the four nullable columns to `model Battle`
      (D1 exact text, immediately after `endedAt`). **Use a context-rich exact `Edit`, never a
      short pattern** — a one-line pattern previously matched three models and triple-inserted a
      relation (Engram 256, trap #12). `feat(prisma): add transient window and abandonment
      columns to battle`
- [ ] 0.3 Impl: `prisma/migrations/*/migration.sql` — four additive `ADD COLUMN` statements, no
      `NOT NULL`, no default, no backfill, no index, no constraint. Additive/nullable-only per
      the proposal's rollback plan. `feat(prisma): add battle window migration`
- [ ] 0.4 RED: `src/battle/rules/battle-transitions.spec.ts` — extend: `closeBattle` on `DEFEAT`
      and `ABANDONMENT`; refusing a non-`IN_PROGRESS` battle; structural guard test asserting
      the union of `BATTLE_TRANSITIONS[*].to` + `BATTLE_CLOSURE.to` covers every `BattleStatus`
      except `PENDING`. `test(battle): cover battle closure and reachable status guard`
- [ ] 0.5 Impl: `src/battle/rules/battle-transitions.ts` — `ClosureReason`, `BATTLE_CLOSURE`,
      `closeBattle()` (D2). `feat(battle): add closure transition for finished battles`
- [ ] 0.6 RED: `src/battle/rules/participant-clause.spec.ts` — challenger/opponent match a
      battle; a stranger does not. `test(battle): cover participant clause predicate`
- [ ] 0.7 Impl: `src/battle/rules/participant-clause.ts` — extract `participantClause` out of
      `battle.service.ts`; export it and the closure surface from `rules/index.ts`.
      `feat(battle): extract participant clause into rules`
- [ ] 0.8 RED: `src/battle/battle.service.spec.ts` — `findForParticipant` returns `null` for a
      stranger and for a non-existent battle; returns the full session row (battle + both
      combatants with `conditions` + `turns` ordered by `round, sequence` +
      `challenger`/`opponent` via `PLAYER_COLUMNS`) for a participant.
      `test(battle): cover findForParticipant scoping and shape`
- [ ] 0.9 Impl: `src/battle/battle.service.ts` — add `findForParticipant(id, userId)`
      (non-throwing); refactor `involvingCaller` to use the extracted `participantClause`.
      `feat(battle): add non-throwing participant-scoped battle read`
- [ ] 0.10 Verify: `pnpm test`, `pnpm lint`, `pnpm build`; confirm `dist/main.js` at the root of
      `dist/`. Measure `git diff --numstat main...feat/add-realtime-battle -- 'src/**/*.ts'
      ':!*.spec.ts'`. Open PR 0 to `main`.

## Slice 1 — `feat/ws-handshake-auth` (base: slice 0)

- [ ] 1.1 Impl: `package.json` — add `@nestjs/websockets`, `@nestjs/platform-socket.io` pinned
      **exact major 11, never 12** (major 12 is pure ESM and breaks this NestJS 11 + CommonJS
      build); `socket.io` dependency; `socket.io-client` devDependency. Run `pnpm install`;
      confirm both `@nestjs/*` entries resolve at major 11 in the lockfile.
      `feat(ws): pin websocket dependencies at major 11`
- [ ] 1.2 RED: `src/ws/ws-auth.middleware.spec.ts` — valid token attaches
      `socket.data.user`; absent, malformed, invalid-signature, and expired tokens all call
      `next(Error)`. Stub `JwtService`, hand-built fake socket (repo convention, no
      `TestingModule`). `test(ws): cover handshake token verification outcomes`
- [ ] 1.3 Impl: `src/ws/ws-auth.middleware.ts` — `server.use()` factory calling
      `JwtService.verifyAsync<AccessTokenPayload>(token, { secret: requireEnv('JWT_SECRET') })`;
      reads `handshake.auth.token` only. `feat(ws): add handshake authentication middleware`
- [ ] 1.4 Impl: `src/ws/battle-events.ts` (partial) — event names, `WsErrorCode` union,
      connection-related payload types. No dedicated test (pure types).
      `feat(ws): add websocket event and error code contract`
- [ ] 1.5 Impl: `src/ws/ws.module.ts` — imports `BattleModule`, `PrismaModule`,
      `JwtModule.register({})`; registers `randomSourceProvider`; provides the gateway.
      `feat(ws): add websocket module wiring`
- [ ] 1.6 Impl: `src/ws/battle.gateway.ts` — `afterInit` installs the auth middleware;
      `handleConnection`/`handleDisconnect` skeletons (no room logic yet).
      `feat(ws): add websocket gateway with handshake authentication`
- [ ] 1.7 Impl: `src/app.module.ts` — register `WsModule`. `feat(ws): register websocket module`
- [ ] 1.8 E2E RED: `test/battle-realtime.e2e-spec.ts` (new file) — a tokenless connection never
      joins (`realtime-battle-session` scenario). **Requires `await app.listen(0)`** — the
      first e2e spec in this repo to open a real listening port, a deliberate new pattern, not
      a mistake. Build the URL from `app.getHttpServer().address()`, not `app.getUrl()` (can
      return an `[::1]` form). Force `transports: ['websocket']`. Reuse
      `battle-lifecycle.e2e-spec.ts`'s REST flow to `ACCEPTED`; usernames use a
      `Date.now().toString(36)` suffix (20-char max). `test(ws): cover tokenless handshake
      rejection`
- [ ] 1.9 Impl: satisfies 1.8 via 1.3/1.6. No separate commit expected.
- [ ] 1.10 Verify: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`; confirm
      `dist/main.js` at the root. Measure diff against slice 0. Open PR 1; retarget base to
      `feat/add-realtime-battle` on GitHub.

## Slice 2 — `feat/ws-message-checks` (base: slice 1)

- [ ] 2.1 RED: `src/ws/rules/message-checks.spec.ts` — each of V1–V7 against passing and
      failing input; `ALREADY_DECLARED` vs `NOT_YOUR_TURN` vs `NO_OPEN_WINDOW` stay distinct
      codes; completeness test asserting `CHECKS.map(c => c.id)` equals `['V1'..'V7']` in
      order. Covers `realtime-battle-session` V1–V7 and "Socket Room Membership Is Never
      Treated as Authorization". `test(ws): cover the seven message validations and
      completeness guard`
- [ ] 2.2 Impl: `src/ws/rules/message-checks.ts` — `MessageIntent`, `Check`, the `CHECKS` array
      (V1 participant, V2 status, V3 turn/open-window, V4 kit membership, V5 skill-type moment,
      V6 reaction availability, V7 slot free), `authorize()`. `feat(ws): add the seven
      per-message validations declared once`
- [ ] 2.3 Verify: `pnpm test`, `pnpm lint`, `pnpm build`. Measure diff against slice 1. Open
      PR 2; retarget base to `feat/ws-handshake-auth`. **If this alone approaches 400, this is
      already its own PR — there is no further internal seam to split at (design keeps the
      array atomic on purpose); ask the user for a `size:exception` instead.**

## Slice 3 — `feat/ws-battle-rooms` (base: slice 2)

- [ ] 3.1 RED: `src/ws/battle-session.service.spec.ts` (partial) — participant-scoped load via
      `findForParticipant`; `authorizeMessage(intent, ctx)` delegates to `rules/message-checks`;
      `NOT_A_PARTICIPANT` maps to the same generic message REST uses, byte-identical for a
      non-existent battle and a real battle the sender doesn't own.
      `test(ws): cover session load and generic non-participant refusal`
- [ ] 3.2 Impl: `src/ws/battle-session.service.ts` (partial) — `load()`,
      `authorizeMessage()`; `battle:state` assembly limited to status/round/activeUserId/
      combatants for now (full assembly lands in slice 7).
      `feat(ws): add battle session load and message authorization entry`
- [ ] 3.3 Impl: `src/ws/battle.gateway.ts` — `battle:join` handler: `authorize('JOIN')`
      (V1/V2 only apply), room admission (`battle:{battleId}`), emits `battle:state` or
      `battle:error`. `feat(ws): add battle rooms and join event`
- [ ] 3.4 Impl: `src/ws/battle-events.ts` — extend with `battle:join`, `battle:state`,
      `battle:error` payloads. Folded into 3.3's commit.
- [ ] 3.5 E2E: extend `battle-realtime.e2e-spec.ts` — a participant joins and receives
      `battle:state`; a non-participant is refused with the generic message; joining a
      non-existent `battleId` gets the byte-identical refusal. `test(ws): cover room admission
      and generic refusal parity`
- [ ] 3.6 Verify: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`. Measure diff against
      slice 2. Open PR 3; retarget base to `feat/ws-message-checks`.

## Slice 4 — `feat/ws-turn-resolution` (base: slice 3)

- [ ] 4.1 RED: `src/ws/turn-resolution.service.spec.ts` (part A) — the claim:
      `updateMany` returning `count === 1` wins, `count === 0` aborts with a sentinel; the
      engine is called with the declared reaction or `null`; `createMany` for `BattleTurn`
      never uses `skipDuplicates`. `test(ws): cover the atomic claim and engine invocation`
- [ ] 4.2 Impl: `src/ws/turn-resolution.service.ts` (part A) — `resolve(battleId, round,
      action, reaction)`: interactive `$transaction`, claim (`WHERE reactionDeadline IS NOT
      NULL`), load both combatants + `conditions` inside `tx`, `resolveTurn` (pure,
      `RANDOM_SOURCE` injected), `createMany` for the 1–2 `BattleTurn` rows — transaction steps
      1–4. `feat(ws): resolve declared actions through combat engine`
- [ ] 4.3 RED: extend part B — `BattleCombatant.currentHp`/`reactionAvailable` updated from the
      returned actor/defender; `reactionAvailable` set `false` **iff**
      `turns[1].skillCode !== null`; `ActiveCondition` upsert/update/delete mirrors
      `CONDITION_APPLIED`/`CONDITION_TICKED`/`CONDITION_EXPIRED`; `Battle.currentRound`/
      `activeUserId` advance, or `closeBattle('DEFEAT')` fields when `defeatedId` is present.
      `test(ws): cover combatant condition and closure persistence`
- [ ] 4.4 Impl: `turn-resolution.service.ts` (part B) — transaction steps 5–7.
      `feat(ws): persist resolved turns`
- [ ] 4.5 **RED — concurrency (design's flagged unvalidated assumption)**:
      `turn-resolution.service.spec.ts` (part C), real database, `Promise.all` of two
      `resolve()` calls for the identical `(battleId, round)`. Asserts exactly one pair of
      `BattleTurn` rows persists and both callers observe the identical result — proving
      Prisma's `updateMany` re-evaluates its `WHERE` after the row lock releases under
      READ COMMITTED. `test(ws): cover exactly-once resolution under concurrent resolve calls`
- [ ] 4.6 Impl: satisfy 4.5 with the existing claim from 4.2. **Named contingency**: if this
      test cannot be made to pass with `tx.battle.updateMany`, replace the claim with
      `SELECT ... FOR UPDATE` via `tx.$queryRaw` to force pessimistic locking before the write,
      and adjust 4.2/4.4 accordingly. This must not be discovered at apply time — this task
      exists to surface it here. `fix(ws): force row lock via queryRaw if updateMany claim
      races` (only if the contingency triggers)
- [ ] 4.7 RED: extend part D — a `P2002` on `(battleId, round, sequence)` re-reads the
      persisted `BattleTurn` rows and combatant state and re-emits, never throws.
      `test(ws): cover idempotent no-op on unique constraint violation`
- [ ] 4.8 Impl: `turn-resolution.service.ts` — catch `P2002`
      (`UNIQUE_VIOLATION`, beside the existing `FOREIGN_KEY_VIOLATION`), re-read, re-emit.
      `feat(ws): treat duplicate turn resolution as idempotent no-op`
- [ ] 4.9 Verify: `pnpm test`, `pnpm lint`, `pnpm build`; confirm `dist/main.js` at the root.
      Measure diff against slice 3 — this is the highest-risk slice. **If it exceeds 400, split
      at the part A/B boundary (4.1–4.4, "resolve") vs. part C/D (4.5–4.8,
      "concurrency+idempotency"), the second based on the first.** Open PR 4; retarget base to
      `feat/ws-battle-rooms`.

## Slice 5 — `feat/ws-action-wiring` (base: slice 4)

- [ ] 5.1 RED: extend `src/ws/battle.gateway.spec.ts` (or a new spec) — `battle:action`
      writes `pendingActionSkillCode`/`reactionDeadline = now + 15s` and emits
      `battle:reaction_window`; `battle:reaction` calls
      `turn-resolution.service.resolve()`, emits `battle:turn_resolved` to both room members,
      `battle:ended` on closure, and calls `startRound` + emits `battle:round_start` for the
      incoming actor. `test(ws): cover action and reaction handler orchestration`
- [ ] 5.2 Impl: `src/ws/battle.gateway.ts` — `battle:action` and `battle:reaction` handlers per
      5.1 (no timer/expiry logic yet — that is slice 6).
      `feat(ws): wire action and reaction handlers to the resolver`
- [ ] 5.3 Impl: `src/ws/battle-events.ts` — extend with `battle:action`, `battle:reaction`,
      `battle:reaction_window`, `battle:turn_resolved`, `battle:ended` payloads;
      `CombatantView`, `TurnView`. Folded into 5.2's commit.
- [ ] 5.4 E2E: extend `battle-realtime.e2e-spec.ts` — full round: action declared, reaction
      declared, both clients receive identical `battle:turn_resolved`, HP/conditions reflected.
      **Script two initiative d20s before the first attack roll** — the `SequenceRandomSource`
      override also drives `freezeCombatant`'s initiative roll during the REST `accept` step;
      under-budgeting the script surfaces as exhaustion, not a wrong assertion.
      `test(ws): cover a full round resolving through both handlers`
- [ ] 5.5 Verify: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`. Measure diff against
      slice 4. Open PR 5; retarget base to `feat/ws-turn-resolution`.

## Slice 6 — `feat/ws-reaction-timeout` (base: slice 5)

- [ ] 6.1 RED: `src/ws/reaction-timer.registry.spec.ts` — `arm()` schedules a callback at
      `deadline - now` (Jest fake timers, safe here since no socket I/O is involved); `cancel()`
      clears it; `onModuleDestroy()` clears every outstanding timer.
      `test(ws): cover reaction timer arm cancel and teardown`
- [ ] 6.2 Impl: `src/ws/reaction-timer.registry.ts` — `Map<battleId, NodeJS.Timeout>`,
      `arm`/`cancel`/`onModuleDestroy`, `.unref()` so it never holds the process (or a Jest run)
      open; the callback calls the same `TurnResolutionService.resolve()`.
      `feat(ws): add in-memory reaction timer registry`
- [ ] 6.3 RED: extend `battle-session.service.spec.ts` — `settleOverdue()` (reaction branch): a
      past `reactionDeadline` triggers `resolve(..., reaction: null)` before the authorize loop
      runs; `reactionAvailable` remains `true` afterward (expiry preserves, never spends).
      `test(ws): cover lazy reaction window expiry preserving the reaction`
- [ ] 6.4 Impl: `src/ws/battle-session.service.ts` — `settleOverdue()` reaction-window branch,
      invoked before `authorize()` on every message. `feat(ws): add reaction window with
      timeout`
- [ ] 6.5 Impl: `src/ws/battle.gateway.ts` — call `settleOverdue()` at the top of every
      handler; wire `reaction-timer.registry.arm()` on `battle:action`, `.cancel()` on
      resolution. `src/ws/ws.module.ts` registers `ReactionTimerRegistry`. Folded into 6.4's
      commit.
- [ ] 6.6 RED: extend for the two ordering guards — a second `battle:reaction` into a closed
      window is refused `NO_OPEN_WINDOW`; a second `battle:action` while the actor's own window
      is still open is refused `ALREADY_DECLARED`, distinct from `NOT_YOUR_TURN`. Covers
      `realtime-reaction-window`'s two ordering requirements.
      `test(ws): cover already-declared and no-open-window refusals`
- [ ] 6.7 Impl: satisfied by `message-checks.ts` (V3, already in place) plus `settleOverdue`
      closing the window before the check runs. No separate commit expected.
- [ ] 6.8 E2E: extend `battle-realtime.e2e-spec.ts` — backdate `reactionDeadline` via
      `prisma.battle.update(...)` (no waiting, no fake timers against real socket I/O, the
      concrete payoff of the persisted deadline); assert the next message resolves with
      `reaction: null` and `reactionAvailable` stays `true`; assert both ordering refusals.
      `test(ws): cover backdated expiry and duplicate declaration refusals`
- [ ] 6.9 Verify: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`. Measure diff against
      slice 5. Open PR 6; retarget base to `feat/ws-action-wiring`.

## Slice 7 — `feat/ws-battle-recovery` (base: slice 6)

- [ ] 7.1 RED: extend `battle-session.service.spec.ts` — full `battle:join` state assembly:
      status, `currentRound`, `activeUserId`, both frozen stat blocks, active conditions,
      `BattleTurn` history ordered by round/sequence, open window with `remainingMs` when
      present, absent when not. `test(ws): cover full reconnect state assembly`
- [ ] 7.2 Impl: `src/ws/battle-session.service.ts` — complete `assembleState()` (extends
      slice 3's partial version). `feat(ws): restore battle state on reconnect`
- [ ] 7.3 RED: extend `battle.gateway.spec.ts` — `handleDisconnect` writes
      `disconnectedUserId`/`disconnectDeadline = now + 2min` and emits `battle:opponent_left`;
      a reconnecting `battle:join` before the deadline clears the disconnect columns and does
      not alter any open reaction window's deadline. `test(ws): cover disconnect notification
      and reconnect clearing`
- [ ] 7.4 Impl: `src/ws/battle.gateway.ts` — `handleDisconnect`; `battle:join` clears disconnect
      state on rejoin. Folded into 7.2's commit.
- [ ] 7.5 RED: extend `battle-session.service.spec.ts` — `settleOverdue()` abandonment branch: a
      passed `disconnectDeadline` with no reconnect closes the battle via
      `closeBattle(survivorId, 'ABANDONMENT')` before the surviving participant's message is
      processed; both clients receive `battle:ended`; a battle abandoned by both stays
      `IN_PROGRESS` until either acts. `test(ws): cover lazy abandonment closure`
- [ ] 7.6 Impl: `src/ws/battle-session.service.ts` — `settleOverdue()` abandonment branch.
      `feat(ws): close battle on abandonment deadline`
- [ ] 7.7 Impl: `src/ws/battle-events.ts` — `battle:opponent_left` payload. Folded into 7.6.
- [ ] 7.8 E2E: extend `battle-realtime.e2e-spec.ts` — disconnect one client mid-window,
      reconnect with a new socket before the deadline, assert the same unchanged deadline and
      recomputed `remainingMs`; backdate `disconnectDeadline` past 2 minutes via
      `prisma.battle.update(...)`, assert the survivor's next message closes the battle with
      `winnerId`/`endedAt` and both remaining clients receive `battle:ended`. **Teardown**:
      disconnect both `socket.io-client` connections before `app.close()`; delete `Battle` rows
      before `User` rows (`BattleCombatant`/`ActiveCondition`/`BattleTurn` cascade from
      `Battle`; `Battle` holds participants with `ON DELETE RESTRICT`).
      `test(ws): cover reconnect mid-window and abandonment closure end to end`
- [ ] 7.9 Verify: `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm build`; confirm
      `dist/main.js` at the root. Full e2e suite green. Measure diff against slice 6. Open
      PR 7; retarget base to `feat/ws-reaction-timeout`.

---

## Traceability Note

All 36 requirements across `realtime-battle-session` (12), `realtime-turn-exchange` (10),
`realtime-reaction-window` (6), and `realtime-battle-recovery` (8) are covered by at least one
task above: session's handshake and V1–V7 in slices 1–2 and 6.6; join/admission/generic-refusal
in slice 3; turn-exchange's resolution, persistence, and idempotency in slices 4–5;
reaction-window's deadline, dual-path convergence, preservation, and ordering guards in slice 6;
recovery's state assembly, disconnect, and abandonment in slice 7. The concurrency scenario
common to `realtime-turn-exchange` and `realtime-reaction-window` (exactly-once resolution) is
traced to task 4.5, the single place both capabilities' idempotency requirement is actually
proven against a real database.

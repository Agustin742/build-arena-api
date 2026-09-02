# Apply Progress: Real-time Battle (Phase 6)

Change: `add-realtime-battle`. Branch: `feat/add-realtime-battle` (base: `main`). Slice 1 branch:
`feat/ws-handshake-auth` (base: `feat/add-realtime-battle`, at `ddc9136`).

## Status (refreshed after Slice 7)

Slices 0-4 MERGED INTO `main` (`582bc15`). Slice 5 was later split into two chained sub-slices
— `feat/ws-session-context` (5a) and `feat/ws-action-wiring` (5b) — which, along with
`feat/ws-reaction-timeout` (Slice 6), were completed, committed and pushed in sessions whose
detail is **not reflected in this file** (the sections below stop at the original, since-resolved
Slice 5 block). Those three branches are pushed and pending merge, stacked in order: 5a → 5b →
6. Git history (`git log`) and the engram topic `sdd/add-realtime-battle/apply-progress` are the
sources of truth for that gap — this file was not updated during those sessions.

**Slice 7 — `feat/ws-battle-recovery` (base: Slice 6) — COMPLETE, all 9 tasks done, 4 commits,
committed locally, NOT pushed.** This was the LAST slice of `add-realtime-battle`. Full detail
appended at the end of this file, after Slice 5's original (since-superseded) block below.
`sdd-verify`/archive not yet run.

<details>
<summary>Original Slice 5 status line (superseded — kept verbatim for history)</summary>

10/10 Slice 0 tasks complete. 10/10 Slice 1 tasks complete. 3/3 Slice 2 tasks complete. 6/6
Slice 3 tasks complete. 9/9 Slice 4 tasks complete. Slice 5: 4/5 tasks complete (5.1-5.4
implemented and fully verified; 5.5 blocked — see below). Slices 6-7 not started.

**Slice 5 is BLOCKED, not committed.** Implementation is complete and every verify command is
green (`pnpm test` 401/401, `pnpm test:cov` clean, `pnpm test:e2e` 39/39, `pnpm lint` clean,
`npx tsc --noEmit` clean, `pnpm build` clean with `dist/main.js` at root), but the measured
logic-line diff is **519 additions / 547 net against the 400 review budget** (1.3x the 45-65
forecast) — per the apply prompt's explicit instruction, work stopped before any commit once
this was measured. `delivery_strategy` is `ask-on-risk` and no `size:exception` was granted, so
a maintainer/orchestrator decision is needed: raise the budget, split slice 5 into two chained
sub-slices, or grant `size:exception`. All changes sit **uncommitted** on `feat/ws-action-wiring`
(branched from slice 4's tip `31e20f0`) — working tree only, nothing staged, nothing pushed.
(This is exactly what happened next: the split into 5a/5b described above.) See
"Slice 5 — Blocked on Review Budget" below for full detail.

Slice 4's native attempt authority is `blocked(maintainer_decision)` pending a
`gentle-ai sdd-attempt reset` — see "Native Runtime Attempt Authority (Slice 4)" below; this does
not affect the correctness of the implementation. Slice 5's own native attempt authority is ALSO
now `blocked(maintainer_decision)` for the same reason (see "Native Runtime Attempt Authority
(Slice 5)" below) — both slices need the same maintainer reset before further attempts can
acquire. (Historical note: this native-attempt block was resolved during the later 5a/5b split,
not reflected in this file.)

</details>

## Completed Tasks (Slice 0)

- [x] 0.1 SDD artifacts committed (already on disk at `4bcc9a9`, prior to this batch)
- [x] 0.2 `prisma/schema.prisma` — four nullable columns added to `model Battle`
- [x] 0.3 `prisma/migrations/20260901140000_add_battle_realtime_window/migration.sql` — four
      additive `ADD COLUMN` statements, written by hand, NOT applied to the database
- [x] 0.4 RED — `battle-transitions.spec.ts` extended: closure on `DEFEAT`/`ABANDONMENT`,
      refusing non-`IN_PROGRESS`, reachable-status structural guard
- [x] 0.5 GREEN — `closeBattle()`, `BATTLE_CLOSURE`, `ClosureReason`, `ClosureOutcome` added to
      `battle-transitions.ts` per design D2
- [x] 0.6 RED — `participant-clause.spec.ts` created: challenger/opponent match, stranger does not
- [x] 0.7 GREEN — `participant-clause.ts` created; `battle.service.ts`'s private clause removed
      in favor of the import; `rules/index.ts` exports the closure surface and `participantClause`
- [x] 0.8 RED — `battle.service.spec.ts` extended: `findForParticipant` null-for-stranger,
      null-for-non-existent, full session row shape, include shape, scoping clause
- [x] 0.9 GREEN — `BattleService.findForParticipant(id, userId)` added (non-throwing);
      `involvingCaller` already used the extracted `participantClause` as of 0.7's refactor
- [x] 0.10 Verify — full suite green, lint clean, `tsc --noEmit` clean, build clean with
      `dist/main.js` at dist root, logic-line diff measured

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` | Modified | Four nullable columns added to `model Battle`, immediately after `endedAt`, exact D1 text |
| `prisma/migrations/20260901140000_add_battle_realtime_window/migration.sql` | Created | Four additive `ADD COLUMN` statements, hand-written, not applied |
| `src/battle/rules/battle-transitions.ts` | Modified | Added `ClosureReason`, `BATTLE_CLOSURE`, `ClosureOutcome`, `closeBattle()` |
| `src/battle/rules/battle-transitions.spec.ts` | Modified | Extended with closure and reachable-status guard tests |
| `src/battle/rules/participant-clause.ts` | Created | Extracted `participantClause` predicate, pure Prisma OR-clause generator |
| `src/battle/rules/participant-clause.spec.ts` | Created | Challenger/opponent match, stranger does not |
| `src/battle/rules/index.ts` | Modified | Exports `BATTLE_CLOSURE`, `closeBattle`, `ClosureOutcome`, `ClosureReason`, `participantClause` |
| `src/battle/battle.mapper.ts` | Modified | Added `BattleSessionRow` type (battle + players + combatants/conditions + turns) |
| `src/battle/battle.service.ts` | Modified | Added `findForParticipant(id, userId)`; local `participantClause` removed in favor of the extracted one |
| `src/battle/battle.service.spec.ts` | Modified | Extended with `findForParticipant` coverage: null cases, shape, include, scoping |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | Slice 0 tasks marked `[x]` |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 0.4/0.5 | `src/battle/rules/battle-transitions.spec.ts` | Unit | 22/22 pre-existing green | Written — 9 new tests failed against `closeBattle`/`BATTLE_CLOSURE` not existing | Passed — 31/31 | 5 cases (DEFEAT, ABANDONMENT, 5x WRONG_STATUS via `it.each`, reachable-status guard) | Clean — no duplication introduced |
| 0.6/0.7 | `src/battle/rules/participant-clause.spec.ts` | Unit | N/A (new file) | Written — module resolution failure confirms code did not exist | Passed — 3/3 new + 29/29 combined with `battle.service.spec.ts` (approval: existing tests still passed after extraction) | 3 cases (challenger, opponent, stranger) | Clean — pure extraction, no behavior change |
| 0.8/0.9 | `src/battle/battle.service.spec.ts` | Unit | 26/26 pre-existing green | Written — 5 new tests failed with `findForParticipant is not a function` | Passed — 31/31 | 5 cases (stranger, non-existent, full shape, include shape, scoping clause) | Clean — lint auto-fix applied, formatting only, no logic change |

### Test Summary
- **Total tests written**: 17 (9 closure + 3 participant-clause + 5 findForParticipant)
- **Total tests passing**: 322/322 (full suite)
- **Layers used**: Unit (17 new; 322 total)
- **Approval tests** (refactoring): the pre-existing `battle.service.spec.ts` suite (26 tests)
  served as the approval baseline for the `participantClause` extraction in 0.7 — all 26 still
  passed unchanged after the refactor
- **Pure functions created**: 2 (`closeBattle`, `participantClause`)

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm test src/battle` -> 5 suites, all passing (`battle-transitions.spec.ts`, `participant-clause.spec.ts`, `battle.service.spec.ts`, plus 2 unrelated pre-existing battle suites); full run: `pnpm test` -> 35 suites, 322/322 tests passing |
| Runtime harness command/scenario and exact result | N/A — per the tasks.md work-unit table: "no REST route reads the new columns yet." `pnpm build` was run instead as the closest applicable check: emits `dist/main.js` at the root of `dist/`, confirmed by directory listing |
| Rollback boundary | Revert the 9 slice-0 commits (`4bcc9a9`..`7d2af3c`, exclusive of `4bcc9a9` which is the pre-existing SDD-docs commit); four `DROP COLUMN` statements undo the (unapplied) migration; delete `src/battle/rules/participant-clause.ts` and its spec; the `closeBattle`/`BATTLE_CLOSURE` additions and `findForParticipant` are additive to existing files and revert cleanly with `git revert` |

## Verification Detail

- `pnpm test`: 35 suites, 322/322 tests passing
- `pnpm lint`: clean (`eslint --fix` applied only Prettier-shaped formatting, no logic changes)
- `npx tsc --noEmit`: clean, no errors
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/` (not `dist/src/main.js`)
- Migration: NOT applied to the database. `pnpm prisma generate` was run (local, safe) so the
  generated client picks up the four new nullable columns.
- Logic-line diff: `git diff --numstat main...feat/add-realtime-battle -- 'src/**/*.ts'
  ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = **106** (budget 400, forecast 80–120 — within
  forecast)

## Deviations from Design

None — implementation matches design D1 (exact Prisma text and migration shape) and D2
(`BATTLE_CLOSURE` + `closeBattle()` as a second, explicitly labeled edge kind).

One judgment call not fully specified by design/tasks: `participant-clause.spec.ts`'s RED test
("challenger/opponent match a battle; a stranger does not") is expressed as a local test-only
`matches()` helper that evaluates `participantClause`'s returned OR-clause fragments against a
plain battle object, since `participantClause` itself is a Prisma clause generator, not a
boolean predicate function. This proves the same "who may see this battle" behavior the design
describes without a live database.

## Issues Found

None.

## Native Runtime Attempt Authority — Risk

`gentle-ai sdd-attempt settle` recorded this attempt's outcome as `passed`, but flagged
`changed_line_budget_exceeded: true` because the attempt's total changed lines (333, including
test files, the migration SQL, and the schema — everything `git diff` touches, not just
authored logic) exceeded the `--max-changed-lines 200` ceiling set at `acquire` time for this
child work unit. This is a DIFFERENT, tighter budget than the review workload's 400
**logic-line** budget (which this slice respected at 106 measured). `sdd-attempt status` now
reports `decision_required: true` and `next_action: "reset"` — a maintainer must run
`gentle-ai sdd-attempt reset` with the printed `--expected-revision` before slice 1 can acquire
attempt authority. This is a native runtime gate, not a code or test problem; it does not affect
the correctness or completeness of slice 0's implementation.

## Workload / PR Boundary

- Mode: stacked PR slice (`stacked-to-main` chain strategy)
- Current work unit: Slice 0 — "Schema + closure + shared read foundation" (PR 0)
- Boundary: starts at `main` (via `4bcc9a9`, SDD docs), ends at `7d2af3c` (lint formatting
  commit); 9 new commits total
- Estimated review budget impact: 106 logic lines against the 400 budget — Low risk, well within
  the 80–120 forecast
- PR 0 not opened; branch not pushed, per instructions. Local commits only.

---

# Slice 1 — `feat/ws-handshake-auth` (base: slice 0, `ddc9136`)

## Completed Tasks (Slice 1)

- [x] 1.1 `package.json`/`pnpm-lock.yaml` — `@nestjs/websockets@11.2.3`,
      `@nestjs/platform-socket.io@11.2.3` (exact pins, both resolve at major 11 in the
      lockfile), `socket.io@^4.8.3` dependency, `socket.io-client@^4.8.3` devDependency
- [x] 1.2 RED — `src/ws/ws-auth.middleware.spec.ts` created: valid token attaches
      `socket.data.user`; absent, malformed, invalid-signature, and expired tokens all call
      `next(Error)` — hand-built fake socket, real `new JwtService({})` (no `TestingModule`,
      matching `auth.service.spec.ts`'s convention)
- [x] 1.3 GREEN — `src/ws/ws-auth.middleware.ts` created: `createWsAuthMiddleware(jwt)`
      factory, reads `handshake.auth.token` only, `JwtService.verifyAsync<AccessTokenPayload>`
      against `requireEnv('JWT_SECRET')`, attaches `{ id, username }` to `socket.data.user`
- [x] 1.4 `src/ws/battle-events.ts` created (partial): `ClientEvent`/`ServerEvent` name
      constants, full `WsErrorCode` union (from design's Denial mapping table), `WsErrorPayload`,
      and `SocketData` (connection-scoped types only — no dedicated test, pure types)
- [x] 1.5 `src/ws/ws.module.ts` created: imports `BattleModule`, `PrismaModule`,
      `JwtModule.register({})`; re-declares `randomSourceProvider`; provides `BattleGateway`
- [x] 1.6 `src/ws/battle.gateway.ts` created: `@WebSocketGateway()` skeleton;
      `afterInit` installs the auth middleware via a sync wrapper (`server.use()` cannot take an
      async callback without tripping `@typescript-eslint/no-misused-promises`);
      `handleConnection`/`handleDisconnect` log the authenticated user, no room logic
- [x] 1.7 `src/app.module.ts` — `WsModule` registered in the root `imports` array
- [x] 1.8 E2E — `test/battle-realtime.e2e-spec.ts` created: `beforeAll` runs the full REST
      flow (register both players, create builds, challenge, accept) to `ACCEPTED` exactly like
      `battle-lifecycle.e2e-spec.ts`, then `app.listen(0)` opens a real port; the one test
      proves a tokenless `socket.io-client` connection fires `connect_error`, never `connect`
- [x] 1.9 Satisfied by 1.3/1.6 — no separate commit
- [x] 1.10 Verify — full unit and e2e suites green, lint clean, `tsc --noEmit` clean, build
      clean with `dist/main.js` at dist root, logic-line diff measured. PR 1 NOT opened, branch
      NOT pushed, per this batch's explicit instruction

## Files Changed (Slice 1)

| File | Action | What Was Done |
|------|--------|---------------|
| `package.json` | Modified | `@nestjs/websockets@11.2.3`, `@nestjs/platform-socket.io@11.2.3` (exact), `socket.io@^4.8.3`; devDependency `socket.io-client@^4.8.3` |
| `pnpm-lock.yaml` | Modified | Lockfile resolution for the above, confirmed at major 11 |
| `src/ws/battle-events.ts` | Created | `ClientEvent`, `ServerEvent`, `WsErrorCode`, `WsErrorPayload`, `SocketData` |
| `src/ws/ws-auth.middleware.ts` | Created | `createWsAuthMiddleware(jwt)` — handshake token verification |
| `src/ws/ws-auth.middleware.spec.ts` | Created | 5 tests: valid, absent, malformed, invalid signature, expired |
| `src/ws/ws.module.ts` | Created | `WsModule` — imports `BattleModule`, `PrismaModule`, `JwtModule.register({})`; provides `BattleGateway`, `randomSourceProvider` |
| `src/ws/battle.gateway.ts` | Created | `BattleGateway` skeleton — `afterInit` wires the auth middleware; connection/disconnect lifecycle hooks only |
| `src/app.module.ts` | Modified | `WsModule` added to root imports |
| `test/battle-realtime.e2e-spec.ts` | Created | Tokenless handshake rejection, against a real `app.listen(0)` port |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | Slice 1 tasks marked `[x]` |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2/1.3 | `src/ws/ws-auth.middleware.spec.ts` | Unit | N/A (new file) | Written — failed on `Cannot find module './ws-auth.middleware'` | Passed — 5/5 | 5 cases (valid, absent, malformed, invalid signature, expired) | Clean — `server.use()` wrapped in a sync callback after a lint failure (`no-misused-promises`), no behavior change |
| 1.8/1.9 | `test/battle-realtime.e2e-spec.ts` | E2E | 34/34 pre-existing e2e green | N/A — this e2e proves 1.3/1.6, already GREEN by the time it was written (per 1.9), not a fresh RED/GREEN pair | Passed — 1/1 | N/A — single scenario per slice boundary (rooms/join are slice 3) | Clean — one `tsc` fix (`app.getHttpServer()` cast through `node:http`'s `Server` before `.address()`), no behavior change |

### Test Summary
- **Total tests written**: 6 (5 middleware unit + 1 e2e)
- **Total tests passing**: 327/327 unit (full suite), 35/35 e2e (full suite, 7 suites)
- **Layers used**: Unit (5 new; 327 total), E2E (1 new; 35 total)
- **Pure functions/factories created**: `createWsAuthMiddleware`

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm test src/ws` -> 1 suite, 5/5 passing; `node ...jest.js --config ./test/jest-e2e.json battle-realtime` -> 1 suite, 1/1 passing |
| Runtime harness command/scenario and exact result | `pnpm build` -> clean, `dist/main.js` confirmed at dist root; full `pnpm test:e2e` with `--detectOpenHandles` -> 7 suites, 35/35 passing, exit code 0, no leaked handles |
| Rollback boundary | Revert the 8 slice-1 commits (`73b0c4d`..`87c9088`); `WsModule` removal from `src/app.module.ts` is a 2-line revert; `src/ws/` deletion removes the rest cleanly; no schema or data changes in this slice |

## Verification Detail

- `pnpm test`: 36 suites, 327/327 tests passing (322 pre-existing + 5 new)
- `pnpm test:e2e`: 7 suites, 35/35 tests passing (34 pre-existing + 1 new), `--detectOpenHandles`
  reported nothing outstanding, 220s total
- `pnpm lint`: clean (one real finding fixed during development —
  `@typescript-eslint/no-misused-promises` on `server.use()` receiving an async callback
  directly; fixed by wrapping it in a `void`-returning sync closure)
- `npx tsc --noEmit`: clean (one real finding fixed — `app.getHttpServer()` returns
  `supertest/types`' `App` union, which does not have `.address()`; fixed by casting through
  `node:http`'s `Server` type first)
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/`
- Resolved dependency versions (confirmed in both `package.json` and `pnpm-lock.yaml`):
  `@nestjs/websockets@11.2.3`, `@nestjs/platform-socket.io@11.2.3` — **both exact major 11**,
  matching the installed `@nestjs/common@11.2.3`
- Logic-line diff: `git diff --numstat feat/add-realtime-battle...feat/ws-handshake-auth --
  'src/**/*.ts' ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = **165** (budget 400, forecast
  75–100 — over forecast, well within budget; see Deviations below)

## Deviations from Design

None structural — implementation matches design's Handshake Authentication section literally
(middleware location, `handshake.auth.token` only, `JwtService.verifyAsync` shape,
`socket.data.user` attachment) and the Event Contract's error-code/event-name vocabulary.

Two implementation-level judgment calls not fully specified by design/tasks:

1. **`battle-events.ts` scope.** The task says "connection-related payload types" for this
   slice, but the design's Event Contract table defines the full event vocabulary and the full
   `WsErrorCode` union in one place with no partial listing given. Declaring the complete
   `ClientEvent`/`ServerEvent` name constants and the complete `WsErrorCode` union now (all pure
   types, no logic) avoids a later slice having to widen a type in a way that could look like
   scope creep in a smaller diff; the payload *shapes* for turn resolution, reactions, etc.
   remain undeclared, matching the letter of "connection-related payload types." This is why the
   logic-line count (165) landed above the 75–100 forecast but still far under the 400 budget.
2. **Middleware error message.** Design does not specify handshake failure error text; the
   middleware always raises `new Error('Unauthorized')` regardless of which of the four rejection
   reasons applies (absent/malformed/bad signature/expired), matching the spec's requirement that
   the client "never learns whether any battle exists" — a uniform message is the safest
   information-hiding default until a later slice's design section says otherwise.

## Issues Found

None. Two lint/type findings surfaced during development (see Verification Detail) and were
fixed before commit — both are TypeScript/ESLint strictness catches, not logic defects.

## Native Runtime Attempt Authority — Risk

Same class of finding as slice 0, on this slice's own attempt. `gentle-ai sdd-attempt settle`
recorded outcome `passed` (`ph6-slice1-settle-1`) but `sdd-attempt status` reports
`changed_line_budget_exceeded: true`: this attempt's total changed lines (**864**, counting the
lockfile, `.spec.ts` files, and every byte `git diff` touches, not just authored logic) exceeded
the `--max-changed-lines 320` ceiling set at `acquire` time. This is the same tighter,
everything-included native budget — separate from the review workload's 400 **logic-line**
budget, which this slice respected at 165 measured. `sdd-attempt status` now reports
`decision_required: true` and `next_action: "reset"`: a maintainer must run
`gentle-ai sdd-attempt reset` with the expected-revision `status` prints
(`sha256:4757506fe030b965da22dcdbd1793185f7d1360f78cf71fb341541f268153376` at time of writing)
before slice 2 can acquire attempt authority. This is a native runtime gate, not a code or test
problem; it does not affect the correctness or completeness of slice 1's implementation.

## Workload / PR Boundary

- Mode: stacked PR slice (`stacked-to-main` chain strategy)
- Current work unit: Slice 1 — "WebSocket handshake authentication" (PR 1)
- Boundary: starts at `ddc9136` (slice 0 tip), ends at `87c9088`; 8 new commits total
- Estimated review budget impact: 165 logic lines against the 400 budget — Low risk, above the
  75–100 forecast but well within budget (see Deviations)
- PR 1 not opened; branch not pushed, per instructions. Local commits only, on
  `feat/ws-handshake-auth`

## Key Learnings

1. `server.use()` on a Socket.IO `Server` expects a void-returning callback, so an `async`
   middleware factory must be invoked from inside a synchronous wrapper (`void authenticate(...)`)
   in `afterInit`, or `@typescript-eslint/no-misused-promises` fails the build.
2. `INestApplication#getHttpServer()` is typed to return `supertest/types`' `App` union
   (`Server | RequestListener | ((req, res) => ...) | string`), which has no `.address()`; a
   real listening-port e2e spec must cast through `node:http`'s `Server` type before calling
   `.address()`.
3. `app.getUrl()` can return an `[::1]`-form address that `socket.io-client` does not always
   dial cleanly in this environment; building the URL from `app.listen(0)`'s resolved
   `AddressInfo.port` against `127.0.0.1` is the reliable form for this repo's first
   real-socket e2e spec.
4. Declaring `@nestjs/websockets` and `@nestjs/platform-socket.io` at the exact same patch
   version as the already-installed `@nestjs/common` (`11.2.3`) is a safe, mechanical way to
   pick the pin — it is the newest release still on major 11 and guaranteed compatible with the
   rest of the NestJS stack already in `package.json`.
5. Socket.IO server middleware rejects a tokenless or invalid-token handshake before
   `handleConnection` fires, so the client only ever observes a `connect_error` event — this
   repo's e2e suite therefore has no way to assert on a REST-style status code for this
   scenario, only on which of `connect`/`connect_error` fires first.

---

# Slice 2 — `feat/ws-message-checks` (base: slice 1, `c272561`)

## Completed Tasks (Slice 2)

- [x] 2.1 RED — `src/ws/rules/message-checks.spec.ts` created: 34 tests covering each of
      V1–V7 against passing and failing input; `ALREADY_DECLARED`/`NOT_YOUR_TURN`/
      `NO_OPEN_WINDOW` asserted as three distinct codes; the `CHECKS.map(c => c.id)` equals
      `['V1'..'V7']` completeness guard; `authorize()` short-circuit and stranger-vs-non-existent
      parity tests
- [x] 2.2 GREEN — `src/ws/rules/message-checks.ts` created: `MessageIntent`, `KitEntry`,
      `ActorView`, `SessionContext`, `WsDenial`, the `CHECKS` array (V1 participant, V2 status,
      V3 turn/open-window, V4 kit membership, V5 skill-type moment, V6 reaction availability, V7
      slot free), `authorize()`
- [x] 2.3 Verify — full unit and e2e suites green, lint clean, `tsc --noEmit` clean, build clean
      with `dist/main.js` at dist root, logic-line diff measured at 233 (budget 400 — no
      `size:exception` needed). PR 2 NOT opened, branch NOT pushed, per this batch's explicit
      instruction

## Files Changed (Slice 2)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/ws/rules/message-checks.ts` | Created | `SessionContext`, `WsDenial`, the `CHECKS` array (V1–V7), `authorize()` |
| `src/ws/rules/message-checks.spec.ts` | Created | 34 tests: one block per validation plus the completeness guard and `authorize()` integration tests |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | Slice 2 tasks marked `[x]` |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1/2.2 | `src/ws/rules/message-checks.spec.ts` | Unit | N/A (new file) | Written — failed on `Cannot find module './message-checks'` | Passed — 33/34 on first implementation, 1 grammar-only failure (`WRONG_SKILL_TYPE` message said "A action" instead of "An action") fixed, then 34/34 | 34 cases: 3+ per validation (pass, fail, and edge cases such as the null-skillCode decline exemption for V4/V5/V6, and the JOIN-does-not-apply cases for V3/V6) | Clean — `eslint --fix` reformatted the spec file (Prettier line-wrapping only), no logic change |

### Test Summary
- **Total tests written**: 34 (all in `message-checks.spec.ts`)
- **Total tests passing**: 361/361 (full suite: 327 pre-existing + 34 new)
- **Layers used**: Unit only (pure functions, no NestJS, no Prisma, no I/O)
- **Pure functions created**: `authorize()`; the `CHECKS` array itself is data, not a function
- **Completeness guard**: yes — `CHECKS.map((c) => c.id)` is asserted to equal
  `['V1','V2','V3','V4','V5','V6','V7']` in that exact order, per design's own text ("so a
  deleted or reordered check fails the suite rather than quietly weakening the surface"). This
  is the literal test both `design.md` and `tasks.md` specify; no additional cross-check against
  the `WsErrorCode` vocabulary was added (see Deviations)

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm test src/ws/rules` -> 1 suite, 34/34 passing; full run: `pnpm test` -> 37 suites, 361/361 passing |
| Runtime harness command/scenario and exact result | N/A — pure functions, no gateway wiring in this slice (rooms/handlers are slice 3+). `pnpm build` run instead: clean, `dist/main.js` confirmed at dist root. Full `pnpm test:e2e` also re-run as a regression check: 7 suites, 35/35 passing, unchanged from slice 1 |
| Rollback boundary | Revert the 3 slice-2 commits (`1e8d109`..`8952ec8`); deleting `src/ws/rules/message-checks.ts` and its spec removes the entire slice cleanly — nothing outside `src/ws/rules/` was touched |

## Verification Detail

- `pnpm test`: 37 suites, 361/361 tests passing (327 pre-existing + 34 new)
- `pnpm test:e2e`: 7 suites, 35/35 tests passing, unchanged from slice 1 (this slice wires
  nothing into the gateway)
- `pnpm lint`: clean (`eslint --fix` reformatted the spec file's line-wrapping only, no logic
  change; one real grammar bug in the implementation, "A action skill..." vs "An action
  skill...", was caught by a RED test and fixed before commit)
- `npx tsc --noEmit`: clean, no errors
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/`
- Logic-line diff: `git diff --numstat feat/ws-handshake-auth...feat/ws-message-checks --
  'src/**/*.ts' ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = **233** (budget 400, forecast
  150–210 — about 11% over forecast, well within budget; see Deviations)

## Deviations from Design

None structural — the `CHECKS` array and `authorize()` match design's "The Seven Validations,
Applied Uniformly" code sketch exactly (same `Check` shape, same loop, same `appliesTo`
mechanism), and the Denial mapping table's code-per-check assignment is followed literally,
including `NOT_A_PARTICIPANT`'s (mapped here to `NOT_FOUND`) byte-for-byte match with REST's
`'Battle not found'` message.

Three implementation-level judgment calls the design's sketch left open (its `run:` bodies were
placeholder comments, not code):

1. **`SessionContext` shape is new, not specified by design.** The design shows `Check.run`
   taking a `SessionContext` but never defines its fields — `battle-session.service.ts`, the
   module that will assemble it from the database, is a later slice. This slice defines
   `SessionContext` as a flat, already-resolved read (status, `activeUserId`,
   `reactionWindowOpen`, the actor's kit and `reactionAvailable`, `slotOccupied`) with no Prisma
   or NestJS dependency, so the type is reusable by that later assembly code without this module
   ever importing it.
2. **`skillCode: null` (explicit reaction decline, per the Event Contract) exempts V4, V5, and
   V6.** A decline carries no skill to check kit membership or type against, and design's own
   text says a decline "preserves the reaction" rather than spending it, so gating a decline on
   `reactionAvailable` would refuse a message that spends nothing. This is the most defensible
   reading but is not spelled out in `realtime-battle-session/spec.md`'s V4–V6 scenarios, which
   are written in terms of a declared (non-null) skill.
3. **A reaction sent by the active player (not the defender) while a window is open is refused
   as `NO_OPEN_WINDOW`, not a new code.** The denial mapping table gives `NO_OPEN_WINDOW` only
   for "the double-reaction case," but there is no code in the vocabulary for "this window is
   not addressed to you," and reusing `NO_OPEN_WINDOW` for both is consistent with the rest of
   V3's information-hiding stance: from the sender's point of view, there is no window open for
   them to answer either way.

The one explicit completeness test the design and tasks both specify — `CHECKS.map(c => c.id)`
equals `['V1'..'V7']` in order — was written exactly as specified. A broader completeness check
(cross-referencing every declared `WsErrorCode` against which check can produce it) was
considered but not added: it would require a runtime-enumerable companion to the `WsErrorCode`
type (which is presently type-only and erased by `ts-jest`'s `isolatedModules`), a change to
`battle-events.ts` that neither `design.md` nor `tasks.md` calls for in this slice, and risked
scope creep beyond "declared once" for a property the existing test already gives structurally
(a deleted or reordered check fails the array-identity assertion).

## Issues Found

None. One real bug surfaced by the RED→GREEN cycle itself and fixed before commit: the V5
`WRONG_SKILL_TYPE` message used "A action skill..." instead of "An action skill..." — caught by
the exact-match `toEqual` assertion (not `toMatchObject`) on that test, fixed with an
article-selection branch, not a logic change.

## Native Runtime Attempt Authority (Slice 2)

`gentle-ai sdd-attempt settle` (`ph6-slice2-settle-1`) recorded outcome `passed` with `state:
"complete"` — no budget exceeded this time. The parent orchestrator's `--max-changed-lines 900`
ceiling comfortably covered this slice's actual footprint (596 raw lines across the two new
files, both spec and implementation, no lockfile or migration churn to inflate the count). No
maintainer reset was needed before this settle, unlike slices 0 and 1.

## Workload / PR Boundary (Slice 2)

- Mode: stacked PR slice (`stacked-to-main` chain strategy)
- Current work unit: Slice 2 — "WebSocket message validations" (PR 2)
- Boundary: starts at `c272561` (slice 1 tip), ends at `8952ec8`; 3 new commits total
  (`1e8d109` RED, `d42ec73` GREEN, `8952ec8` tasks.md)
- Estimated review budget impact: 233 logic lines against the 400 budget — Low risk, ~11% above
  the 150–210 forecast but well within budget (see Deviations)
- PR 2 not opened; branch not pushed, per instructions. Local commits only, on
  `feat/ws-message-checks`

## Key Learnings (Slice 2)

1. `ts-jest` with `isolatedModules: true` erases `import type` statements at transpile time, so
   a runtime completeness guard that needs to enumerate a type-only union (like `WsErrorCode`)
   would need a parallel runtime `const` array — the union itself cannot be iterated at test
   time without one.
2. An exact-match assertion (`toEqual`) on a full denial object, not a partial one
   (`toMatchObject({ code: ... })`), is what actually catches a copy-paste grammar bug in a
   message string; several of this slice's tests would have stayed green with only a
   `code`-only assertion.
3. When a design's code sketch defines a function signature with a redundant-looking parameter
   (`authorize(intent, ctx)` where `ctx` could in principle carry its own `intent` field), the
   safest reading is to implement it exactly as written rather than "simplifying" it — the
   `Check.run(ctx)` signature in the same sketch has no `intent` parameter of its own, so `ctx`
   must carry it for a check to behave differently per intent, which is why both ended up
   present.
4. A validation module that must treat `skillCode: null` as a first-class, always-valid input
   (an explicit decline) rather than an edge case forces every skill-dependent check (V4, V5,
   V6) to short-circuit on it consistently — writing that short-circuit as the first line of
   each check's `run()`, rather than filtering it out earlier, keeps each check's "real" logic
   readable as the ACTION/REACTION path only.

---

# Slice 3 — `feat/ws-battle-rooms` (base: slice 2, `e91e3cd`)

## Completed Tasks (Slice 3)

- [x] 3.1 RED — `src/ws/battle-session.service.spec.ts` created: 11 tests covering
      `load()`'s delegation to `findForParticipant`, `authorizeMessage()`'s delegation to the
      shared `CHECKS` pipeline, and `admitJoin()`'s end-to-end behavior — the byte-identical
      `NOT_FOUND` refusal for a stranger and a non-existent battle, the `START` transition
      firing with initiative-based `activeUserId` selection (including the tie-break to the
      challenger), no re-fire once already `IN_PROGRESS`, and `toStatePayload()`'s assembly
- [x] 3.2 GREEN — `src/ws/battle-session.service.ts` created: `load()`, `authorizeMessage()`,
      `admitJoin()` (the composed entry point: load → build a `JOIN` `SessionContext` →
      `authorizeMessage` → fire `applyTransition('START', ...)` and persist when the battle
      was `ACCEPTED`), `toStatePayload()`
- [x] 3.3/3.4 GREEN — `src/ws/battle.gateway.ts` extended with the `battle:join`
      `@SubscribeMessage` handler (room admission via `socket.join('battle:{battleId}')`,
      `battle:state`/`battle:error` emission); `src/ws/battle-events.ts` extended with
      `BattleJoinPayload`, `BattleStateCombatant`, `BattleStatePayload`; `src/ws/ws.module.ts`
      registers `BattleSessionService`
- [x] 3.5 E2E — `test/battle-realtime.e2e-spec.ts` extended: a participant joins an `ACCEPTED`
      battle and receives `battle:state` with `status: IN_PROGRESS`, `currentRound: 1`, two
      combatants; a non-participant and a non-existent `battleId` both receive the
      byte-for-byte identical `battle:error` refusal
- [x] 3.6 Verify — full unit and e2e suites green, lint clean, `tsc --noEmit` clean, build
      clean with `dist/main.js` at dist root, logic-line diff measured at 249 (budget 400)

## Files Changed (Slice 3)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/ws/battle-session.service.ts` | Created | `BattleSessionService`: `load()`, `authorizeMessage()`, `admitJoin()`, `toStatePayload()`; initiative-based `activeUserId` selection on `START` |
| `src/ws/battle-session.service.spec.ts` | Created | 11 tests: load delegation, authorizeMessage delegation, admitJoin (refusal parity, START firing, tie-break, no re-fire, wrong-status), toStatePayload assembly |
| `src/ws/battle.gateway.ts` | Modified | Added `handleJoin()` — `@SubscribeMessage(ClientEvent.JOIN)`, room admission, `battle:state`/`battle:error` emission |
| `src/ws/battle-events.ts` | Modified | Added `BattleJoinPayload`, `BattleStateCombatant`, `BattleStatePayload` |
| `src/ws/ws.module.ts` | Modified | Registers `BattleSessionService` as a provider |
| `test/battle-realtime.e2e-spec.ts` | Modified | Added participant-join and non-participant/non-existent-refusal-parity e2e tests; lifted `battleId`/tokens to describe-block scope; added `connectAuthenticated`/`join` helpers and a `stranger` test user |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | Slice 3 tasks marked `[x]` |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1/3.2 | `src/ws/battle-session.service.spec.ts` | Unit | N/A (new file) | Written — failed on `Cannot find module './battle-session.service'` | Passed — 11/11 | 11 cases: load (2), authorizeMessage (2), admitJoin (5: non-existent, stranger-parity, START-fires, tie-break, already-in-progress, wrong-status), toStatePayload (1) | Clean — `eslint --fix` reformatted only (line-wrapping), no logic change |
| 3.3/3.4/3.5 | `test/battle-realtime.e2e-spec.ts` | E2E | 1/1 pre-existing e2e green (tokenless handshake) | Written and run against the pre-gateway-change code — both new tests timed out waiting for `battle:state`/`battle:error` (60s each), confirming RED | Passed — 3/3 in the file, 37/37 full e2e suite | 3 cases: valid join, non-participant refusal, non-existent-battle refusal (byte-identical to the non-participant case) | Clean — no follow-up changes needed after GREEN |

### Test Summary
- **Total tests written**: 13 (11 unit + 2 e2e)
- **Total tests passing**: 372/372 unit (full suite), 37/37 e2e (full suite, 7 suites)
- **Layers used**: Unit (11 new; 372 total), E2E (2 new; 37 total)
- **Pure functions/services created**: `BattleSessionService` (one new injectable); `joinContext`
  and `initiativeWinner` as private module-level helpers inside it

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm test src/ws/battle-session.service.spec.ts` -> 1 suite, 11/11 passing; `node ...jest.js --config ./test/jest-e2e.json battle-realtime` -> 1 suite, 3/3 passing |
| Runtime harness command/scenario and exact result | Full `pnpm test:e2e --detectOpenHandles` -> 7 suites, 37/37 passing, no leaked handles, 82s total; `pnpm build` -> clean, `dist/main.js` confirmed at dist root |
| Rollback boundary | Revert the 4 slice-3 commits (`1631869`..`a12477d`); `BattleSessionService` registration is a 2-line addition/removal in `ws.module.ts`; the `handleJoin()` method is additive to `battle.gateway.ts`; deleting `src/ws/battle-session.service.ts` and its spec removes the rest cleanly; nothing outside `src/ws/` and the one e2e spec was touched |

## Verification Detail

- `pnpm test`: 38 suites, 372/372 tests passing (361 pre-existing + 11 new)
- `pnpm test:e2e --detectOpenHandles`: 7 suites, 37/37 tests passing (35 pre-existing + 2 new),
  no leaked handles
- `pnpm lint`: clean (`eslint --fix` reformatted the e2e spec's line-wrapping only, no logic
  change)
- `npx tsc --noEmit`: clean, no errors
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/`
- Logic-line diff: `git diff --numstat feat/ws-message-checks...feat/ws-battle-rooms --
  'src/**/*.ts' ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = **249** (budget 400, forecast
  75–100 — above forecast, well within budget, same pattern as slices 1–2)

## Deviations from Design

None structural. Two implementation-level judgment calls the design/tasks left open:

1. **Where the `START` transition fires.** The instructions say "the gateway" calls
   `applyTransition('START', ...)`, and design's module table marks `battle.gateway.ts` as
   "Transport only... No rule." Reading those together, the transition call and its Prisma
   persistence were placed inside `BattleSessionService.admitJoin()` — design's own description
   of that file as "the authorization pipeline entry point" — rather than inside the gateway
   file itself, so the gateway stays a pure gate: authorize, join room, emit. This keeps
   `applyTransition` reachable from exactly one place in the WS layer, matching how REST calls
   it from exactly one place (`BattleService.move`/`accept`).
2. **`BattleStateCombatant` instead of `CombatantView`.** `tasks.md`'s task 5.3 explicitly lists
   `CombatantView` as a type slice 5 adds. Since slice 3's `battle:state` needs a combatant
   shape today, it is declared under a slice-scoped name (`BattleStateCombatant`, same fields
   as design's `CombatantView`) so slice 5 can introduce `CombatantView` cleanly as its own
   export rather than this slice colliding with a name a later slice is tasked with creating.
3. **Initiative-based `activeUserId` on `START`.** Design's "Round advancement" section (not
   task 3.x's own text) specifies "`START` sets `currentRound = 1` and `activeUserId` to the
   higher `initiative` (ties break to the challenger, deterministically)" — this was
   implemented in `admitJoin()` reading `initiative` off the already-loaded `combatants` array,
   with no extra database read.

## Issues Found

None.

## Native Runtime Attempt Authority (Slice 3)

`gentle-ai sdd-attempt settle` (`ph6-slice3-settle-1`) recorded outcome `passed` with
`decision_required: false` and `next_action: "complete"` — no maintainer reset needed this
time, unlike slices 0 and 1. The attempt's own everything-included changed-line count was 614
(evidence-revision-scoped, includes spec/test files) against the `--max-changed-lines 700`
ceiling set at `acquire` — comfortably inside it.

## Workload / PR Boundary (Slice 3)

- Mode: stacked PR slice (`stacked-to-main` chain strategy)
- Current work unit: Slice 3 — "WebSocket battle rooms and `battle:join`" (PR 3)
- Boundary: starts at `e91e3cd` (slice 2 tip), ends at `a12477d`; 4 new commits
  (`1631869` RED unit, `bb6ec8d` GREEN unit, `b73373d` RED e2e, `08d5a07` GREEN gateway,
  `a12477d` tasks.md)
- Estimated review budget impact: 249 logic lines against the 400 budget — Low risk, above the
  75–100 forecast but well within budget (see Deviations)
- PR 3 not opened; branch not pushed, per instructions. Local commits only, on
  `feat/ws-battle-rooms`

## Key Learnings (Slice 3)

1. `applyTransition('START', battle, actorId)` is guaranteed `allowed: true` once V1
   (participant) and V2 (status `ACCEPTED`/`IN_PROGRESS`) have already passed for the `JOIN`
   intent, because `START`'s rule (`ACCEPTED -> IN_PROGRESS`, `entitled: 'EITHER'`) requires
   exactly the same two facts — the shared-table reuse is not just DRY, it makes the transition
   call structurally unable to disagree with the check that gated it.
2. `findForParticipant`'s scoped `findFirst` collapsing "does not exist" and "not yours" into
   the same `null` means the `NOT_A_PARTICIPANT`/`NOT_FOUND` refusal parity test for the WS
   layer needs no special-casing at all — both scenarios are one code path once the read itself
   is scoped, unlike a naive `findUnique` + separate ownership check would require.
3. A `battle:state` payload type does not need to match a later slice's fuller type by name:
   naming this slice's combatant view `BattleStateCombatant` instead of anticipating slice 5's
   `CombatantView` avoided a forward reference to a type that does not exist yet.
4. Socket.IO's `client.once('battle:state', ...)` and `client.once('battle:error', ...)` raced
   against a single `emit` is a clean way to assert "exactly one of these two mutually exclusive
   outcomes happens," without needing a timeout-based negative assertion for the event that
   does not fire.

---

# Slice 4 — `feat/ws-turn-resolution` (base: slice 3, `c4d6b54`)

## Completed Tasks (Slice 4)

- [x] 4.1 RED — `src/ws/turn-resolution.service.spec.ts` (part A): the atomic claim
      (`count === 1` wins and reaches the engine, `count === 0` never does), the declared
      reaction (or `null`) reaching `resolveTurn`, and `createMany` never using
      `skipDuplicates`
- [x] 4.2 GREEN — `src/ws/turn-resolution.service.ts` (part A): `resolve(battleId, round,
      actionSkillCode, reactionSkillCode)` — interactive `$transaction`: the claim
      (`updateMany` `WHERE reactionDeadline IS NOT NULL`), load both combatants + conditions +
      the skill catalog rows, `resolveTurn` (pure, `RANDOM_SOURCE` injected), `createMany` for
      the `BattleTurn` rows
- [x] 4.3 RED — extended part B: `BattleCombatant.currentHp`/`reactionAvailable` persistence
      (spent iff `turns[1].skillCode !== null`), `ActiveCondition` upsert on
      `CONDITION_APPLIED`, round advancement, and `DEFEAT` closure
- [x] 4.4 GREEN — `turn-resolution.service.ts` (part B): transaction steps 5-7 —
      `persistCombatants`, `persistConditions` (generic over `CONDITION_APPLIED`/`_TICKED`/
      `_EXPIRED`, though only `_APPLIED` fires from inside `resolveTurn` itself), and
      `persistBattleAdvance` (round increment + `activeUserId` flip, or `closeBattle('DEFEAT')`
      when `defeatedId` is present)
- [x] 4.5 RED — concurrency, real database: `Promise.all` of two `resolve()` calls for the
      identical `(battleId, round)`. Ran against the real database and PASSED on the first
      attempt — see "The Concurrency Test" below
- [x] 4.6 — no code change needed. The claim from 4.2 already satisfies 4.5; the named
      `SELECT ... FOR UPDATE` contingency did not trigger
- [x] 4.7 RED — extended part D: a `P2002` on `(battleId, round, sequence)` re-reads the
      persisted `BattleTurn` rows and combatant state and re-emits, never throws and never
      re-runs the engine
- [x] 4.8 GREEN — catches `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'`
      alongside the internal `ClaimLostError` sentinel, both routed to the same
      `reReadResolution()` helper
- [x] 4.9 Verify — full unit and e2e suites green, lint clean, `tsc --noEmit` clean, build
      clean with `dist/main.js` at dist root, logic-line diff measured at exactly 400
      (budget 400 — see "Workload / PR Boundary")

## Files Changed (Slice 4)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/ws/turn-resolution.service.ts` | Created | `TurnResolutionService.resolve()`: the atomic claim, engine invocation, `BattleTurn`/`BattleCombatant`/`ActiveCondition`/`Battle` persistence, `DEFEAT` closure, and the `ClaimLostError`/`P2002` idempotent re-emit path (`reReadResolution()`) |
| `src/ws/turn-resolution.service.spec.ts` | Created | Parts A/B/D: 11 mocked-Prisma unit tests (claim win/lose, engine invocation with/without a reaction, no `skipDuplicates`, combatant/condition/closure persistence, P2002 idempotency). Part C: 1 real-database concurrency test |
| `package.json` | Modified | `test` script now runs `node --experimental-vm-modules node_modules/jest/bin/jest.js` (was bare `jest`) — required the moment a unit spec instantiates a real `PrismaClient`; Prisma 7's query compiler loads through a dynamic `import()` that Jest's sandbox forbids without the flag, exactly why `test:e2e` already carried it |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | Slice 4 tasks marked `[x]` |

Scope discipline: `src/ws/ws.module.ts` was deliberately NOT touched. Design's file-layout
table lists `TurnResolutionService` as one of `WsModule`'s eventual providers, but this slice's
explicit Boundaries instruction scopes it to "`turn-resolution.service.ts` and its tests" only —
DI registration is deferred to slice 5, when the gateway actually calls it.

## The Concurrency Test

What it did when run: two `Promise.all`-raced `resolve()` calls against a real,
freshly-created `Battle` row (`IN_PROGRESS`, `reactionDeadline` 60s in the future,
`pendingActionSkillCode: 'POWER_STRIKE'`) and two real `BattleCombatant` rows, sharing one
`TurnResolutionService` instance and one 8-value `SequenceRandomSource` script (only 2 values
needed if the claim serializes correctly; ample margin left so a real double-resolution would
fail on a wrong row count rather than mask itself as script exhaustion).

Result: passed on the first run, both under `node --experimental-vm-modules
node_modules/jest/bin/jest.js src/ws/turn-resolution.service.spec.ts` directly and via the
corrected `pnpm test`. Exactly 2 `BattleTurn` rows persisted for `(battleId, round: 1)`; both
callers' returned `turns`, `defender.currentHp`, and `defeatedId` were identical — the loser
re-read the winner's own result rather than computing a different one.

The `updateMany` assumption HELD. Prisma's `updateMany` does re-evaluate its `WHERE` after
the row lock releases under Postgres READ COMMITTED, exactly as design's "Transaction
Boundaries" section asserted. The named `SELECT ... FOR UPDATE` fallback was NOT needed —
task 4.6 required no code change beyond what 4.2 already implemented.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1-4.4, 4.7-4.8 | `src/ws/turn-resolution.service.spec.ts` (parts A/B/D) | Unit (mocked Prisma) | N/A (new file) | Written — failed on `Cannot find module './turn-resolution.service'` | Passed — 11/11 on first implementation | 11 cases across claim win/lose, reaction-present/absent, `skipDuplicates` absence, combatant HP + `reactionAvailable` (spent/preserved), `ActiveCondition` upsert, round advance, `DEFEAT` closure, P2002 re-emit | Clean — `eslint --fix` reformatted only (line-wrapping), no logic change |
| 4.5-4.6 | `src/ws/turn-resolution.service.spec.ts` (part C) | Integration (real PostgreSQL, no mocks) | N/A (new describe block) | Written against the already-passing 4.2 implementation, per design intent — this is the validation task for an assumption the design explicitly flagged as unverified, not a behavior-first RED | Passed — 1/1 real-database concurrency assertion, first run | Single case: the concurrent-race scenario is the whole triangulation this task calls for; a second racer-count would not exercise a different code path | None needed |

Note on 4.5's RED status: unlike a conventional TDD RED (test fails because the production
code does not exist yet), task 4.5 by design tests an assumption underneath already-implemented
code (`resolveTurn`'s claim, from 4.2) — the design explicitly names it "the design's flagged
unvalidated assumption" and provides a named contingency (4.6) for exactly the case where this
test would have gone RED against correct-looking code. It passed GREEN on the first run, which
is the reported, positive answer to the question the task exists to ask.

### Test Summary
- Total tests written: 12 (11 unit + 1 real-database concurrency)
- Total tests passing: 384/384 unit (full suite, up from 372), 37/37 e2e (unchanged, full suite)
- Layers used: Unit/mocked-Prisma (11 new; 384 total), Integration/real-database (1 new)
- Pure functions/services created: `TurnResolutionService` (one new injectable, no new pure
  functions — it is a thin transactional orchestrator around the unchanged `src/combat` engine,
  per design's "reimplements none of the engine's rules")

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `node --experimental-vm-modules node_modules/jest/bin/jest.js src/ws/turn-resolution.service.spec.ts` -> 1 suite, 12/12 passing (11 mocked + 1 real-database) |
| Runtime harness command/scenario and exact result | `pnpm test` (full unit suite, now `--experimental-vm-modules`) -> 39 suites, 384/384 passing; `pnpm test:e2e` -> 7 suites, 37/37 passing, all pre-existing e2e still green; `pnpm build` -> clean, `dist/main.js` confirmed at dist root |
| Rollback boundary | Revert the 4 slice-4 commits (`083b1fc`..`1e539a2`); `turn-resolution.service.ts` and its spec are both new, self-contained files under `src/ws/`, referenced by nothing else yet (not wired into `ws.module.ts` or the gateway) — deleting both files and reverting the one-line `package.json` script change removes the entire slice cleanly |

## Verification Detail

- `pnpm test`: 39 suites, 384/384 tests passing (372 pre-existing + 12 new)
- `pnpm test:e2e`: 7 suites, 37/37 tests passing, unchanged from slice 3 — this slice touches no
  gateway or session code
- `pnpm lint`: clean (`eslint --fix` reformatted line-wrapping only, no logic change)
- `npx tsc --noEmit`: clean, no errors
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/`
- Logic-line diff: `git diff --numstat feat/ws-battle-rooms...feat/ws-turn-resolution --
  'src/**/*.ts' ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = exactly 400 (budget 400,
  forecast 170-240 — at the ceiling, not over it; see Risks below)

## Deviations from Design

1. `resolve()`'s parameter names. Tasks.md's prose names them `action, reaction`; the
   implementation names them `actionSkillCode: string, reactionSkillCode: string | null` for
   clarity, since the sequence diagram's `resolve(battleId, round, reactionSkillCode)` (3
   params) and tasks.md's own 4-param description disagree on whether the action skill code is
   a parameter at all. Tasks.md's literal 4-parameter description was followed as the more
   specific, phase-scoped instruction.
2. `persistBattleAdvance`'s round-7 scope. Design's "Round advancement" section describes
   the full per-turn cycle as "increments `currentRound` and flips `activeUserId`, then calls
   `startRound` for the incoming actor only." Only the increment+flip half is implemented
   here, exactly matching the Transaction Boundaries table's own row 7 wording ("advance
   `currentRound` + `activeUserId`, or `closeBattle` fields") and the sequence diagram, where the
   `startRound` call is a visibly separate step the gateway makes after `battle:turn_resolved`
   is emitted — that belongs to slice 5/6, which own the gateway and its post-resolution
   orchestration.
3. `persistConditions` handles all three condition event types generically, even though
   only `CONDITION_APPLIED` can currently fire from inside `resolveTurn` itself (`CONDITION_
   TICKED`/`_EXPIRED` are `startRound`-only events, per `src/combat/state/round.ts`). Task 4.3's
   own wording ("mirrors `CONDITION_APPLIED`/`CONDITION_TICKED`/`CONDITION_EXPIRED`") asks for
   the mapping to be complete, not conditional on which events the engine happens to emit today.

## Issues Found

None in the implementation. One project-level gap found and fixed: `pnpm test` could not
instantiate a real `PrismaClient` at all before this slice (every prior unit spec mocked
Prisma) — see the `package.json` change above.

## Native Runtime Attempt Authority (Slice 4)

`gentle-ai sdd-attempt acquire` (`ph6-slice4-acq-child-1`) returned `state: "proceed"` with the
parent-issued token, `--max-changed-lines 900`. `gentle-ai sdd-attempt settle`
(`ph6-slice4-settle-1`, `outcome: passed`, `evidence-revision:
sha256:80467cc7330627c7862791e897f0c4818b96c404ae3144c14aa0cbf9936d33a4`) returned
`state: "blocked"`, `reason: "maintainer_decision"`. `sdd-attempt status` confirms why:
this attempt's own everything-included changed-line count is **1165** (evidence-revision-scoped:
every byte `git diff` touches across `turn-resolution.service.ts`, its spec file including the
real-database part C, and the one-line `package.json` script change — not just the 400
review-budget **logic** lines measured separately) against the `--max-changed-lines 900`
ceiling set at `acquire`. `changed_line_budget_exceeded: true`, `decision_required: true`,
`next_action: "reset"` — same class of finding as slices 0 and 1: a maintainer must run
`gentle-ai sdd-attempt reset` with the `--expected-revision` `status` prints before slice 5 can
acquire attempt authority. This is the native runtime's own everything-included budget, separate
from and stricter than the review workload's 400 **logic-line** budget (which this slice hit
exactly at 400, not exceeded); it does not affect the correctness or completeness of slice 4's
implementation — all tests pass, including the real-database concurrency test.

## Workload / PR Boundary (Slice 4)

- Mode: stacked PR slice (`stacked-to-main` chain strategy)
- Current work unit: Slice 4 — "Turn resolution: the atomic claim, engine invocation, and
  idempotent persistence" (PR 4)
- Boundary: starts at `c4d6b54` (slice 3 tip), ends at `1e539a2`; 4 new commits (`083b1fc` RED
  parts A/B/D, `dbbe4e8` GREEN parts A/B/D, `f806180` RED+infra part C, `1e539a2` tasks.md)
- Estimated review budget impact: exactly 400 logic lines against the 400 budget — at the
  ceiling, well above the 170-240 forecast. The single new file (`turn-resolution.service.ts`)
  carries the transaction's full seven-statement sequence, three private persistence helpers,
  and the idempotent re-read path; splitting it further would fragment one atomic transaction
  across files, which the design explicitly does not want. No margin remains in this slice for
  a follow-up fix without exceeding budget — a correction would need to land as part of slice
  5's own budget instead of amending this PR.
- PR 4 not opened; branch not pushed, per instructions. Local commits only, on
  `feat/ws-turn-resolution`

## Key Learnings (Slice 4)

1. Prisma's `updateMany` genuinely does re-evaluate its `WHERE` clause after a row lock releases
   under Postgres READ COMMITTED — verified against a real database with two concurrently raced
   transactions, not assumed: the compare-and-clear claim is sufficient on its own, and the
   `SELECT ... FOR UPDATE` fallback exists only as an unused safety net.
2. `resolveTurn`'s returned `defender.reactionAvailable` is always the unchanged input value —
   the engine never writes it (only `startRound` does) — so a caller that persists it verbatim
   would silently never spend a reaction; the correct persisted value has to be computed from
   `turns[1].skillCode !== null`, not read off the engine's return.
3. Prisma 7's WASM query compiler loads via a dynamic `import()`, which fails under Jest's
   default CommonJS sandbox with "invoked without --experimental-vm-modules" — this only
   surfaces the first time a unit spec instantiates a real `PrismaClient` rather than mocking
   it, which is why 372 prior unit tests never hit it.
4. Throwing a marker error (`ClaimLostError`) from inside an interactive `$transaction` callback
   and catching it just outside is a clean way to force a rollback-then-fall-through-to-a-
   separate-read, without needing the transaction callback to return a discriminated "did I
   claim it" result that every caller would have to check.
5. A `createMany` without `skipDuplicates` inside an interactive transaction rolls back
   everything already written in that same transaction on a `P2002` — including the claim's own
   `updateMany` — which is why the idempotent re-read has to run as a separate, non-`tx`
   read after the transaction has already unwound.

---

# Slice 5 — `feat/ws-action-wiring` (base: slice 4, `31e20f0`) — BLOCKED, not committed

Branch `feat/ws-action-wiring` created from slice 4's tip (`31e20f0`). All work is complete and
verified but sits **uncommitted in the working tree only** — see "Why blocked" below.

## Completed Tasks (Slice 5)

- [x] 5.1 RED — `src/ws/battle.gateway.spec.ts` (new file): 6 unit tests covering
      `handleAction` (denial → `battle:error`, admission → `declareAction` + `battle:reaction_window`
      to everyone but the sender) and `handleReaction` (denial → `battle:error`; admission →
      `resolve()` → room-wide `battle:turn_resolved`; continuing → `startRound()` +
      `battle:round_start`; ending → `battle:ended`, no `startRound` call)
- [x] 5.2 GREEN — `src/ws/battle.gateway.ts`: `handleAction` and `handleReaction` handlers.
      Both are thin: read fresh session context via `session.admitAction`/`admitReaction`, deny
      via `battle:error` on failure, otherwise hand off to `BattleSessionService.declareAction`
      or `TurnResolutionService.resolve()`. **No rule logic added to this file** — every
      legality decision still routes through `authorize()` in `rules/message-checks.ts`
      (untouched this slice); the gateway only shapes payloads and routes emits
- [x] 5.3 GREEN — `src/ws/battle-events.ts`: added `BattleActionPayload`, `BattleReactionPayload`,
      `TurnView`, `WindowView`, `BattleReactionWindowPayload`, `BattleTurnResolvedPayload`,
      `BattleEndedPayload`, `BattleRoundStartPayload`. Renamed `BattleStateCombatant` →
      `CombatantView` (the design's canonical name, per that file's own slice-1 comment
      flagging this exact rename as deferred to slice 5) and updated `BattleStatePayload` and
      `battle-session.service.ts`'s `toCombatantView` to use it — no behavior change, single
      shared type instead of two identical ones
- [x] 5.4 E2E — extended `test/battle-realtime.e2e-spec.ts` with a second, independent
      `describe` block (own `INestApplication`, own port, own users) that overrides
      `RANDOM_SOURCE` with a scripted `SequenceRandomSource([15, 5, 15, 5, 10, 10, 10, 10])` —
      2 initiative d20s (challenger then opponent, consumed during REST `accept`), then the
      round's attack d20 and its 1d8 damage roll, padded with margin. Full round: challenger
      declares `POWER_STRIKE`, opponent receives `battle:reaction_window` with
      `applicableSkillCodes: ['DODGE', 'PARRY']` (both answer PHYSICAL; `FIREBALL` is excluded
      as an ACTION-type skill), opponent declares `PARRY`, both clients receive a
      byte-identical `battle:turn_resolved` (defender HP 30 → 27, PARRY halves 1d8(5)+2=7 down
      to 3) and a byte-identical `battle:round_start` (round 2, `activeUserId` = opponent)
- [ ] 5.5 Verify — **BLOCKED**. All four commands ran and are green (detail below), the diff
      was measured (that measurement is what triggered the block), but PR 5 was never opened
      and nothing was committed, per the apply prompt's explicit stop-before-commit instruction.

## Additional production changes beyond the literal task list

Two small, deliberately minimal extensions outside `battle.gateway.ts`/`battle-events.ts` were
needed to keep the gateway "thin" (no rule/judgment logic) while still reusing existing engine
code rather than reimplementing it:

1. **`src/combat/turn.ts`** — the private `resolutionOf` helper (PHYSICAL/MAGIC from a skill's
   `requiredAttribute`, R14) is now exported as `actionResolutionOf`, with its parameter
   widened from `DeclaredAction` to `Pick<CombatSkill, 'requiredAttribute'>` so a caller outside
   the engine can call it directly. `battle:reaction_window`'s `applicableSkillCodes` needs this
   exact mapping (to filter the defender's kit through `REACTION_TABLE`/`isApplicable`, both
   already exported); exporting the engine's own one-liner was judged safer than duplicating it
   a second time in `src/ws`. Internal call site updated; `turn.spec.ts` gained 2 direct tests.
2. **`src/ws/turn-resolution.service.ts`** — two additions, both reusing existing private
   helpers rather than adding new persistence logic:
   - `TurnResolutionOutcome` gained `winnerId: string | null` / `endedAt: Date | null`, needed
     to build the wire's `battle:ended` payload. On a fresh resolve, `persistBattleAdvance` now
     returns `closeBattle`'s own already-computed `winnerId` (never re-derived); on a re-emit,
     `reReadResolution` reads the already-persisted `Battle.winnerId`/`endedAt` columns back —
     both paths read a value the service already computed/persisted, never recompute one.
   - `startRound(round, actor): Promise<RoundStartOutcome>` — a new public method, one small
     `$transaction` that calls the pure engine `startRound()`, persists
     `reactionAvailable: true`, and calls the **already-existing, unmodified**
     `persistConditions(tx, events)` private helper (previously used only from `resolve()`) to
     persist the tick's condition events. Zero new condition-persistence logic. This is exactly
     what slice 4's own apply-progress flagged as deferred here: *"the full `startRound` call
     for the incoming actor is a separate step the gateway makes after `battle:turn_resolved`...
     that belongs to slice 5/6."*
   Both changes are additive to an existing, already-tested file; no prior slice-4 behavior
   changed (all 13 pre-existing `turn-resolution.service.spec.ts` tests still pass unmodified).
3. **`src/ws/ws.module.ts`** — registered `TurnResolutionService` as a provider (1 line +
   import), completing the DI wiring slice 4 deliberately deferred: *"DI registration is
   deferred to slice 5, when the gateway actually calls it."*

## Files Changed (Slice 5)

| File | Action | What Was Done |
|------|--------|---------------|
| `src/combat/turn.ts` | Modified | Exported `actionResolutionOf` (was private `resolutionOf`), widened its parameter type |
| `src/combat/turn.spec.ts` | Modified | 2 new tests for `actionResolutionOf` as public API |
| `src/ws/battle-events.ts` | Modified | New client/server payload types; `BattleStateCombatant` renamed to `CombatantView` |
| `src/ws/battle-session.service.ts` | Modified | `messageContext` (ACTION/REACTION context builder incl. kit loading), `admitAction`, `admitReaction`, `declareAction`, `applicableReactionSkillCodes`, `kitFor` |
| `src/ws/battle-session.service.spec.ts` | Modified | 8 new tests for the above |
| `src/ws/battle.gateway.ts` | Modified | `handleAction`, `handleReaction`, and the `toCombatantView`/`toTurnView`/`toTurnResolvedPayload`/`toEndedPayload` wire mappers; constructor now also takes `TurnResolutionService` |
| `src/ws/battle.gateway.spec.ts` | Created | 6 unit tests for the two new handlers |
| `src/ws/turn-resolution.service.ts` | Modified | `winnerId`/`endedAt` on the outcome type; new `startRound()` method (reuses `persistConditions`) |
| `src/ws/turn-resolution.service.spec.ts` | Modified | 5 new tests (winnerId/endedAt on 2 existing scenarios + re-emit; 2 new `startRound` tests) |
| `src/ws/ws.module.ts` | Modified | Registered `TurnResolutionService` as a provider |
| `test/battle-realtime.e2e-spec.ts` | Modified | New `describe` block, own app instance, scripted `RANDOM_SOURCE`, full-round e2e test |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified | 5.1-5.4 marked `[x]`; 5.5 marked blocked with detail |

Scope discipline confirmed: **no condition in `battle.gateway.ts` decides whether a move is
legal.** Every V1-V7 check still lives exclusively in `rules/message-checks.ts` (byte-for-byte
unchanged this slice). The gateway's two new handlers each contain exactly one `if (!result.ok)`
branch (route to `battle:error` or continue) and one `if (outcome.defeatedId)` branch (route to
`battle:ended` or continue to `startRound`) — both are pure result-routing on values already
computed by `BattleSessionService`/`TurnResolutionService`, not new legality judgments. No
in-memory reaction timer was built (slice 6). No full state reassembly, disconnect handling, or
abandonment closure was built (slice 7). `prisma migrate dev/deploy/db:push/db:seed` were never
run.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| turn.ts export | `src/combat/turn.spec.ts` | Unit | ✅ 24/24 (pre-existing, all still pass) | ➖ Structural rename+export of already-tested logic (both branches already covered indirectly by existing PHYSICAL/MAGIC tests); 2 direct tests added as approval/triangulation, not strict RED-first | ✅ 26/26 | ✅ 2 cases (MAGIC, PHYSICAL) | ➖ None needed |
| battle-session.service.ts (admitAction/admitReaction/declareAction) | `src/ws/battle-session.service.spec.ts` | Unit (mocked Prisma) | ✅ 11/11 (pre-existing) | ✅ Written — 8 new tests failed on `TypeError: ... is not a function` / undefined mock reads | ✅ 19/19 | ✅ Out-of-turn denial, kit-admitted, kit-denied (ACTION); decline-admitted, no-window-denial, kit-denied (REACTION); deadline+payload shape, `REACTION_TABLE`-filtered `applicableSkillCodes` (declareAction) | ✅ Clean — no restructuring needed |
| turn-resolution.service.ts (winnerId/endedAt, startRound) | `src/ws/turn-resolution.service.spec.ts` | Unit (mocked Prisma) | ✅ 8/8 (pre-existing) | ✅ Written — 5 new tests failed (3 on `undefined` winnerId/endedAt, 2 on `service.startRound is not a function`) | ✅ 13/13 | ✅ No-defeat (both null) vs DEFEAT (both set) vs re-emit (read from DB); condition survives-and-ticks vs condition-already-0-removed (Decision C) | ✅ Clean |
| battle.gateway.ts (handleAction/handleReaction) | `src/ws/battle.gateway.spec.ts` (new) | Unit (hand-built fake socket/server, no `TestingModule` — matches `ws-auth.middleware.spec.ts` convention) | N/A (new file) | ✅ Written — all 6 failed on `TypeError: gateway.handle{Action,Reaction} is not a function` | ✅ 6/6 | ✅ ACTION: denial vs admission; REACTION: denial vs continuing (broadcast + startRound) vs ended (no startRound) | ✅ Clean — one lint pass (`@typescript-eslint/unbound-method` on `expect(socket.emit)`; fixed by returning the raw mock functions from the test's `fakeSocket` helper alongside the typed socket, asserting on the mocks directly) |
| test/battle-realtime.e2e-spec.ts (full round) | `test/battle-realtime.e2e-spec.ts` | E2E (real DB, real sockets, real HTTP, scripted dice) | ✅ 3/3 (pre-existing describe block, untouched, still pass) | ➖ Written against already-GREEN unit-level production code, per design intent — this is the "does it actually work end to end, with two real Socket.IO clients and a real transaction" proof, not a behavior-first RED (same posture as slice 4's real-database concurrency test) | ✅ 1/1 on first run | ➖ Single scenario: the full round IS the triangulation this task calls for (action → window → reaction → resolution → next round) | ➖ None needed |

### Test Summary
- Total tests written: 22 (2 + 8 + 5 + 6 + 1)
- Total tests passing: 401/401 unit (full suite, up from 384 at slice 4 baseline), 39/39 e2e
  (full suite, up from 38 at slice 4 baseline)
- Layers used: Unit/mocked-Prisma or hand-built-fakes (21 new; 401 total unit), E2E/real-stack
  (1 new; 39 total e2e)
- Pure functions/services created: 0 new services — `TurnResolutionService.startRound` extends
  an existing one; `toCombatantView`/`toTurnView`/`toTurnResolvedPayload`/`toEndedPayload` in
  `battle.gateway.ts` are new pure mapper functions (module-level, no `this`, no I/O)

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `npx jest src/ws/battle.gateway.spec.ts src/ws/battle-session.service.spec.ts src/ws/turn-resolution.service.spec.ts src/combat/turn.spec.ts` → 4 suites, 64/64 passing |
| Runtime harness command/scenario and exact result | `pnpm test:e2e` → 8 suites, 39/39 passing (all 38 pre-existing e2e tests still green, +1 new full-round test) |
| Rollback boundary | Nothing is committed — `git status --short` on `feat/ws-action-wiring` shows only working-tree modifications and one untracked file (`src/ws/battle.gateway.spec.ts`); `git checkout -- .` (or simply not committing) fully reverts this slice with zero effect on slice 4 or earlier |

## Verification Detail

- `pnpm test`: 40 suites, 401/401 tests passing (384 pre-existing + 17 new unit)
- `pnpm test:cov`: same 40/401, coverage thresholds pass; `battle.gateway.ts` line coverage
  75.71% (unit-only — the uncovered lines are `handleJoin`'s pre-existing paths and a few
  "unreachable" invariant-guard throws; the e2e test exercises the full happy path live)
- `pnpm test:e2e`: 8 suites, 39/39 tests passing (38 pre-existing + 1 new), all pre-existing
  e2e still green, no open-handle hangs
- `pnpm lint`: clean after one fix round (`eslint --fix` first auto-reformatted line-wrapping in
  `battle.gateway.ts`/`battle-session.service.ts`/`turn-resolution.service.ts`, then flagged
  `@typescript-eslint/unbound-method` on three `expect(socket.emit)`/`expect(socket.to)`
  assertions in the new gateway spec — fixed by having the test's `fakeSocket` helper return the
  raw `emit`/`to` mock functions alongside the typed socket, asserting on those directly instead
  of the socket's own bound methods)
- `npx tsc --noEmit`: clean, no errors
- `pnpm build`: clean; `dist/main.js` confirmed at the root of `dist/`
- Logic-line diff (exact prompt formula): `git diff --numstat feat/ws-turn-resolution --
  'src/**/*.ts' ':!*.spec.ts' | awk '{s+=$1} END {print s}'` = **519** (additions only) against
  the 400 budget; additions+deletions = 547. Both exceed 400. Forecast was 45-65 — off by
  roughly 8-11x, a larger miss than slice 4's own ~2x miss (170-240 forecast, 400 actual).
- Per-file breakdown of the non-spec diff (`+ / -`): `battle-session.service.ts` 190/3,
  `battle.gateway.ts` 175/1, `battle-events.ts` 81/10, `turn-resolution.service.ts` 53/9,
  `turn.ts` 13/4, `ws.module.ts` 7/1

## Why Blocked — the forecast miss, explained

The 45-65 forecast covered only the two `@SubscribeMessage` handlers and their direct payload
types. It did not account for (and the tasks.md text for 5.1-5.3 does not mention) three
substantial pieces of supporting logic the design requires but does not assign a home for
explicitly:

1. **ACTION/REACTION `SessionContext` construction**, including a fresh kit lookup
   (`Build -> BuildSkill -> Skill`) neither `findForParticipant` nor any prior slice loads —
   `joinContext` (slice 1) only ever built a `JOIN` context with `actor: null`. This alone is
   ~110 of `battle-session.service.ts`'s 190 added lines.
2. **`applicableSkillCodes` computation** for `battle:reaction_window` — REACTION_TABLE/
   isApplicable filtering against the defender's kit and the action's PHYSICAL/MAGIC
   resolution, which required exporting `actionResolutionOf` from the engine (design says this
   value is "computed from the defender's kit through REACTION_TABLE and isApplicable," but
   assigns no file to the computation itself).
3. **`startRound` + persistence**, explicitly named in slice 4's own apply-progress as
   deferred here ("a separate step the gateway makes... that belongs to slice 5/6") but not
   reflected in slice 5's 45-65 forecast or its literal task list.

None of these are scope creep — all three are named in the design document (Event Contract,
sequence diagram 1, "Round advancement," "Spending the reaction is the gateway's job") and
required to satisfy `realtime-turn-exchange`'s requirements. The forecast simply undercounted
the orchestration weight of "thin" handlers that still have to build correct, kit-aware
authorization context and shape five distinct outgoing payload types.

## Native Runtime Attempt Authority (Slice 5)

`gentle-ai sdd-attempt acquire` (`ph6-slice5-acq-child-1`, `--max-changed-lines 600`) returned
`state: "proceed"` with the parent-issued token. `gentle-ai sdd-attempt settle`
(`ph6-slice5-settle-1`, `outcome: interrupted` — no `evidence-revision`, since `interrupted`
does not require one) returned `state: "blocked"`, `reason: "maintainer_decision"`, the same
class of finding as slices 0, 1, and 4: this attempt's own everything-included changed-line
count exceeds the `--max-changed-lines 600` ceiling set at `acquire` (working-tree diff alone,
across all touched files including specs and the e2e file, is 1321 insertions / 32 deletions =
1353 lines). A maintainer must run `gentle-ai sdd-attempt reset` with the `--expected-revision`
`status` prints before another slice 5 attempt (or slice 6) can acquire. This is independent
confirmation, from the native runtime's own accounting, of the same review-budget overage
measured above — not a new or different problem.

## Workload / PR Boundary (Slice 5)

- Mode: stacked PR slice (`stacked-to-main` chain strategy) — **not delivered this batch**
- Current work unit: Slice 5 — "Action/reaction gateway handlers wired to the resolver" —
  implementation and verification complete, delivery blocked
- Boundary: would start at `31e20f0` (slice 4 tip) and end with one or more new commits — **zero
  commits exist**; all 11 changed files (10 modified + 1 new) sit in the working tree only
- Estimated review budget impact: 519 additions / 547 net against the 400 budget (1.3x over) —
  **exceeds budget**, unlike slice 4 which hit exactly 400. `delivery_strategy` is `ask-on-risk`;
  no `size:exception` was granted in this apply invocation, so per the apply prompt's explicit
  instruction ("If it exceeds 400, STOP and report before committing further"), no commit was
  made
- PR 5 not opened, branch not pushed (as instructed, and additionally blocked by the above)

### Options for the next decision (not decided here — this is a report, not a choice)

1. **Grant `size:exception`** for slice 5 as a single ~550-line PR — the three supporting pieces
   above (context+kit loading, `applicableSkillCodes`, `startRound`+persistence) are cohesive
   with the two handlers they serve; splitting them apart would scatter one conceptual unit
   ("wire the handlers to the resolver, correctly") across artificial file boundaries.
2. **Split into two chained sub-slices** — e.g. 5a: `BattleSessionService` context/kit/
   `declareAction`/`applicableSkillCodes` work (~280 lines) as its own PR targeting slice 4;
   5b: the two gateway handlers + `TurnResolutionService.startRound` (~270 lines) as a PR
   targeting 5a. Both would individually clear 400.
3. **Raise the slice 5 budget** in tasks.md's Review Workload Forecast table and proceed as one
   PR, documenting the revised number for future slices' calibration (the same pattern already
   visible slice-over-slice: slice 4 forecast 170-240, landed at exactly 400).

## Key Learnings (Slice 5)

1. `resolutionOf`'s PHYSICAL/MAGIC mapping (a skill's `requiredAttribute === 'MAGIC'`) is needed
   outside the combat engine — by `battle:reaction_window`'s `applicableSkillCodes` — and
   exporting the engine's own already-tested one-liner (renamed `actionResolutionOf`, widened to
   accept just `{requiredAttribute}`) is safer than re-deriving the same mapping a second time.
2. No prior slice loads a combatant's kit (`Build -> BuildSkill -> Skill`) — `joinContext` only
   ever built a `JOIN` context with `actor: null` — so ACTION/REACTION authorization needed a
   new context builder with its own kit query, which was the single largest addition in this
   slice and the main driver of the forecast miss.
3. `TurnResolutionService.persistConditions(tx, events)` (built in slice 4 for `resolve()`) is
   generic enough to reuse verbatim for `startRound()`'s own condition-tick persistence — zero
   new condition-persistence logic was needed, only a new `$transaction` wrapper around the pure
   engine call and one `reactionAvailable: true` update.
4. `@typescript-eslint/unbound-method` fires on `expect(socket.emit)`/`expect(socket.to)` even
   inside a hand-built fake-socket object literal; the fix is to have the test helper return the
   raw mock functions alongside the typed socket and assert on those directly, not on the
   socket's own (unbound) method properties.
5. A 45-65 line forecast for "thin" WebSocket handlers undercounted by roughly 8-11x once the
   handlers' full supporting context (kit-aware authorization, reaction-window computation, and
   round-start persistence — all named in the design but not assigned a file or a line estimate)
   is accounted for; slice 4's own 170-240→400 miss (~2x) did not fully anticipate this.

---

# Slice 7 — `feat/ws-battle-recovery` (base: Slice 6) — COMPLETE, 4 commits, NOT pushed

This was the LAST slice of `add-realtime-battle`. Base branch `feat/ws-reaction-timeout` (Slice
6) was checked out fresh; `feat/ws-battle-recovery` created from it and never pushed, per the
apply prompt's explicit boundary.

## Completed Tasks (9/9)

- [x] 7.1/7.2 — `BattleSessionService.toStatePayload` (design's `assembleState`; the existing
      method name was kept) became `async` and now returns the FULL reconnect payload: `turns`
      (mapped from `BattleSessionRow.turns`, already ordered round/sequence by
      `findForParticipant`), `openWindow` (`WindowView | null` — reuses the existing
      `applicableReactionSkillCodes`, never re-derived; `remainingMs = max(0, deadline - now)`),
      `opponentLeft` (`LeftView | null`). `battle-events.ts` gained `LeftView`,
      `BattleOpponentLeftPayload`, `SocketData.battleId?`, and `BattleStatePayload` extended with
      the three new fields.
- [x] 7.3/7.4 — `BattleGateway.handleJoin` records `socket.data.battleId` after a successful
      join (Socket.IO has already left every room by the time `disconnect` fires, so this is the
      only way `handleDisconnect` knows which battle to act on). `handleDisconnect` calls new
      `BattleSessionService.recordDisconnect(battleId, userId)` — sets
      `disconnectedUserId`/`disconnectDeadline = now+2min` only when the battle is `IN_PROGRESS`
      and the caller is a participant; returns the deadline, or `null` (nothing to notify). The
      gateway emits `battle:opponent_left` when non-null. New private
      `BattleSessionService.clearDisconnectIfMine(row, actorId)` runs inside `admitJoin`: a
      targeted update (`disconnectedUserId: null, disconnectDeadline: null` only) fires only when
      `row.disconnectedUserId === actorId` — never touches `reactionDeadline`, satisfying "does
      not alter any open reaction window's deadline".
- [x] 7.5/7.6/7.7 — `settleOverdue()`'s return type became `SettleOutcome | null`
      (`{kind:'TURN_RESOLVED', outcome} | {kind:'ABANDONED', winnerId, endedAt}`). New private
      `closeIfAbandoned(battleId, battle)` runs FIRST inside `settleOverdue`, before the
      reaction-window branch: if `disconnectDeadline` has passed, computes `survivorId`
      (whichever of challenger/opponent is NOT `disconnectedUserId`) and calls
      `closeBattle(battle, survivorId, 'ABANDONMENT')` from `src/battle/rules` — the D2 decision,
      no hand-rolled status flip. On `allowed`, persists `status/winnerId/endedAt` and clears
      `disconnectedUserId/disconnectDeadline` in one update, returns `{kind:'ABANDONED',...}`. On
      `!allowed` (some other path already closed it) returns `null` gracefully — NOT a throw,
      unlike the DEFEAT path's `throw` on its equivalent unreachable case, because this path is
      genuinely reachable: `settleOverdue` runs unconditionally on EVERY message with no
      precondition, so it can legitimately observe an already-`FINISHED` battle. The gateway's
      private `settleOverdue` wrapper branches on `outcome.kind`: `'ABANDONED'` emits
      `battle:ended` (reason `'ABANDONMENT'`) directly to the room; `'TURN_RESOLVED'` delegates to
      the existing `emitResolution`.
- [x] 7.8 — New e2e describe block in `test/battle-realtime.e2e-spec.ts` (own app instance, own
      `RANDOM_SOURCE` override `[15,5,15,5,10,10,10,10]` — the abandonment closure consumes NO
      dice). One scenario: opponent's real socket disconnects mid-window
      (`opponentSocket.close()`) → challenger receives `battle:opponent_left` → a NEW socket
      reconnects and re-joins BEFORE the 2-minute deadline → asserts `state.openWindow.deadline`
      UNCHANGED, `remainingMs` recomputed smaller, `state.opponentLeft` cleared to `null` → the
      reconnected socket finishes the SAME round (`battle:reaction` PARRY) → both clients
      converge on `battle:turn_resolved`/`battle:round_start` (round 2, active=opponentId) →
      the reconnected socket disconnects for real again (round 2's active player, never having
      acted) → challenger gets `battle:opponent_left` again → `disconnectDeadline` backdated via
      `prisma.battle.update` (bypassing the real 2-minute wait, same style as the existing
      reaction-window-expiry test bypasses its 15s wait) → challenger emits `battle:join` (any
      message would do) → asserts `battle:ended` with `winnerId=challengerId`,
      `reason='ABANDONMENT'`, `endedAt` set, AND a direct DB read confirms `status=FINISHED`.
- [x] 7.9 — Verify: `pnpm test` 431/431 (up from 414 pre-slice-7), `pnpm test:cov` 431/431
      clean, `pnpm test:e2e` 43/43 (42 pre-existing +1 new), `pnpm lint` clean,
      `npx tsc --noEmit` clean, `pnpm build` clean with `dist/main.js` at root. Not pushed; PR
      not opened, per the apply prompt's explicit boundary (local commits only).

## Files Changed

| File | Action |
|---|---|
| `src/ws/battle-events.ts` | Modified — `LeftView`, `BattleOpponentLeftPayload`, `SocketData.battleId?`, `BattleStatePayload` extended |
| `src/ws/battle-session.service.ts` | Modified — async `toStatePayload` full assembly, `openWindowView`, `toTurnView`/`toLeftView`, `recordDisconnect`, `clearDisconnectIfMine`, `SettleOutcome` type, `closeIfAbandoned` |
| `src/ws/battle-session.service.spec.ts` | Modified — ~20 new/updated tests |
| `src/ws/battle.gateway.ts` | Modified — `handleJoin` sets `socket.data.battleId` + awaits `toStatePayload`; `handleDisconnect` async + `recordDisconnect`; `settleOverdue` wrapper branches on `SettleOutcome.kind` |
| `src/ws/battle.gateway.spec.ts` | Modified — new `handleDisconnect` describe, ABANDONED-branch test, battleId-remembered test |
| `test/battle-realtime.e2e-spec.ts` | Modified — new describe block, 1 new e2e test (283 lines) |
| `openspec/changes/add-realtime-battle/tasks.md` | Modified — 7.1-7.9 all `[x]` |

No `ws.module.ts` change was needed this slice — no new injectable; `recordDisconnect`,
`clearDisconnectIfMine` and `closeIfAbandoned` are all methods on the already-registered
`BattleSessionService`.

## Commits (4, local only, NOT pushed)

1. `feat(ws): restore battle state on reconnect` — `toStatePayload` full assembly + disconnect
   tracking/clearing (7.1-7.4 folded, per task instructions)
2. `feat(ws): close battle on abandonment deadline` — `settleOverdue` abandonment branch
   (7.5-7.7 folded)
3. `test(ws): cover reconnect mid-window and abandonment closure end to end` — the e2e (7.8)
4. `docs(ws): mark slice 7 tasks complete` — `tasks.md`

Achieved via a deliberate temporary-revert-then-reapply technique on the 4 shared files (all
abandonment work was interleaved with reconnect-state work in the same functions/files):
implemented everything together first and verified green, then used the Edit tool to strip the
abandonment-specific hunks back out, committed the reconnect-state slice, re-applied the
abandonment hunks via Edit, verified green again, and committed. No `git add -p`/interactive
staging was used (disallowed under this session's constraints) — pure Read/Edit reconstruction
plus targeted `git add <files>`.

## Budget

Forecast 75-95 logic lines; measured (additions+deletions, `src/**/*.ts` excluding
`*.spec.ts`, vs `feat/ws-reaction-timeout`): **319/400** — under budget, unlike every prior
slice (slice 5 overshot ~8x). No `size:exception` needed.

## Design decisions honored

- **D2 (`closeBattle`)**: abandonment closure goes through
  `closeBattle(battle, survivorId, 'ABANDONMENT')` from
  `src/battle/rules/battle-transitions.ts` — the exact same function the DEFEAT path already
  used. No hand-rolled `prisma.battle.update({status: FINISHED})` in the gateway or session for
  this purpose.
- **Lazy-only abandonment**: no background sweep exists or was added — a battle abandoned by
  both participants simply has no survivor message to trigger `settleOverdue`'s abandonment
  branch, and stays `IN_PROGRESS` forever until either acts. Explicitly the design's stated
  accepted limitation, not a gap.
- **Reconnect e2e reads from the DATABASE, not memory**: the recovered `battle:state` after
  reconnect is assembled from a fresh `findForParticipant` read via `toStatePayload`; nothing
  about the reaction window or the disconnect is held in the gateway's own memory across the
  disconnect — the whole point of `reactionDeadline`/`disconnectDeadline` being persisted
  columns, provable the same way the slice 6 expiry test proves it (backdating the column
  rather than waiting out real time).

## Native Runtime Attempt Authority (Slice 7)

`sdd-attempt acquire` (`ph6-slice7-acq-child-1`, `--max-changed-lines 1400`) → `state: proceed`.
`sdd-attempt settle` (`ph6-slice7-settle-1`, `--outcome passed`, `--harness-disposition reused`,
with evidence-revision hash, diagnosis, cleanup-evidence and process-evidence) → `state:
complete`.

## Key Learnings (Slice 7)

1. `settleOverdue()` had to check abandonment BEFORE the reaction-window branch, because it
   runs unconditionally on every message and a battle can simultaneously have an overdue
   reaction window AND a passed disconnect deadline — abandonment must win (the battle is over)
   and must never resolve a turn on a battle it is about to close.
2. `closeIfAbandoned` returns `null` gracefully (never throws) when `closeBattle` refuses a
   non-`IN_PROGRESS` battle, unlike the DEFEAT path's `throw` on its equivalent case — because
   `settleOverdue` genuinely can observe an already-`FINISHED` battle (it runs on every message
   with no precondition), whereas the DEFEAT path's `closeBattle` call is reached only from
   inside a transaction that already confirmed `IN_PROGRESS` moments earlier.
3. `socket.data.battleId`, set in `handleJoin` after a successful join, is the only reliable way
   `handleDisconnect` can know which room to act on — Socket.IO has already removed the
   disconnecting socket from every room by the time the `disconnect` event fires, so
   `socket.rooms` is useless there.
4. A rejoining participant must clear ONLY their own `disconnectedUserId`/`disconnectDeadline`
   via a targeted update — never the other participant's, and never touching
   `reactionDeadline`/`pendingActionSkillCode` in the same statement, or a reconnect would
   silently reset an unrelated open reaction window.
5. The pre-existing e2e-suite crash
   (`ReferenceError: You are trying to require a file after the Jest environment has been torn
   down`, from a `pg`/SSL worker-teardown race under Node 24) reproduces on the UNMODIFIED
   slice-6 baseline too — confirmed by `git stash` before/after — and does not affect the exit
   code (0) or the reported pass count; it is a pre-existing environment flake, not a
   regression, and was left untouched per the no-touch pattern already established for
   `security.e2e-spec.ts`.

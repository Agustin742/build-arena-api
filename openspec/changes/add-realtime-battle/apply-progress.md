# Apply Progress: Real-time Battle (Phase 6)

Change: `add-realtime-battle`. Branch: `feat/add-realtime-battle` (base: `main`). Slice 1 branch:
`feat/ws-handshake-auth` (base: `feat/add-realtime-battle`, at `ddc9136`).

## Status

10/10 Slice 0 tasks complete. 10/10 Slice 1 tasks complete. 3/3 Slice 2 tasks complete.
Slices 3–7 not started. Ready for `sdd-verify` on slices 0–2, or for `sdd-apply` to continue
with slice 3 once PR 2 is reviewed/merged per the stacked-to-main chain strategy.

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

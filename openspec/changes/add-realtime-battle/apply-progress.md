# Apply Progress: Real-time Battle (Phase 6)

Change: `add-realtime-battle`. Branch: `feat/add-realtime-battle` (base: `main`). Slice 1 branch:
`feat/ws-handshake-auth` (base: `feat/add-realtime-battle`, at `ddc9136`).

## Status

10/10 Slice 0 tasks complete. 10/10 Slice 1 tasks complete. Slices 2–7 not started. Ready for
`sdd-verify` on slices 0–1, or for `sdd-apply` to continue with slice 2 once PR 1 is
reviewed/merged per the stacked-to-main chain strategy.

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

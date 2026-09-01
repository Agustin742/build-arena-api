# Apply Progress: Real-time Battle (Phase 6)

Change: `add-realtime-battle`. Branch: `feat/add-realtime-battle` (base: `main`). Scope of this
batch: **Slice 0 only** (schema + closure + shared read foundation).

## Status

10/10 Slice 0 tasks complete. Slices 1–7 not started. Ready for `sdd-verify` on slice 0, or for
`sdd-apply` to continue with slice 1 once PR 0 is reviewed/merged per the stacked-to-main chain
strategy.

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

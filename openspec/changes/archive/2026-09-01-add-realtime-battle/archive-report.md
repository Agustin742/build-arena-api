# Archive Report: Real-time Battle (Phase 6)

**Change**: add-realtime-battle  
**Archived**: 2026-09-01  
**Archive path**: `openspec/changes/archive/2026-09-01-add-realtime-battle/`  
**Engram topic key**: `sdd/add-realtime-battle/archive-report`

## Executive Summary

The real-time battle change has completed verification, all nine slices have been merged, and the four new capabilities have been promoted to live specs. The change resolves end-to-end WebSocket communication, turn exchange, reaction window mechanics, and battle abandonment recovery within the existing combat engine. Verification verdict: **pass_with_warnings** (36/36 requirements, 52/52 scenarios, 0 blockers, 0 critical findings).

## Verification Summary

**Verdict**: pass_with_warnings  
**Requirements met**: 36/36  
**Scenarios passed**: 52/52  
**Blockers**: 0  
**Critical findings**: 0  
**Warnings**: 3 (all documentation-tracking; fixed before archive in commit f8abbf5)

### Test Results (Final state on `main`)

- `pnpm test`: 432/432 tests in 41 suites ✓
- `pnpm test:e2e`: 43/43 tests in 8 suites ✓
- `pnpm lint`: clean ✓
- `npx tsc --noEmit`: clean ✓
- `pnpm build`: clean, `dist/main.js` at root of `dist/` ✓

### Delivery Metrics

Nine slices across eleven PRs (#34–#44), all merged to `main` (commit 23c2275).

Measured logic lines per slice (all within review budget of 400):
- Slice 0: 106 lines
- Slice 1: 165 lines
- Slice 2: 233 lines
- Slice 3: 249 lines
- Slice 4: 400 lines
- Slice 5a: 344 lines (split from original forecast of 519)
- Slice 5b: 175 lines (split from original forecast of 519)
- Slice 6: 179 lines
- Slice 7: 302 lines

Slice 5 was forecast at 45–65 requirements but measured 519 logic lines. Split at the service/transport boundary into 5a and 5b on the user's explicit decision under `delivery_strategy: ask-on-risk`. No `size:exception` was ever granted.

## Design Decisions Resolved

### D1: Transient Real-time State Storage

**Decision**: Transient real-time state lives in four nullable columns on `Battle`:
- `pendingActionSkillCode`
- `reactionDeadline`
- `disconnectedUserId`
- `disconnectDeadline`

These are NOT stored in a side table.

**Rationale**: The reaction window must clear in the same transaction that writes the turn. A side table would require a separate cascade delete or multi-table coordination, risking orphaned state if the turn write fails. The transaction boundary is atomic and clear.

**Artifact**: Migration `20260901140000_add_battle_realtime_window` (additive, nullable columns only).

### D2: Battle Closure as a Distinct Edge

**Decision**: Closure got its own edge kind (`BATTLE_CLOSURE` + `closeBattle()`) alongside `BATTLE_TRANSITIONS`, not a `FINISH` row in the transitions table.

**Rationale**: Authorization depends on which PLAYER may move. The `entitled` column names the authorized player for each transition. For server-initiated closure (e.g., both players abandoned), no honest player value exists. Using `'EITHER'` would allow a losing player to call `applyTransition` and end their own battle, violating the rule that only a winning or tied state permits closure by either player. A separate edge and method eliminate this ambiguity.

## Promoted Capabilities

Four new capabilities are now live in `openspec/specs/`:

1. **realtime-battle-session** — WebSocket handshake and authentication
   - Handles absent, malformed, invalid-signature, and expired tokens
   - Rejects before any frame is sent
   - All 9 requirements in 14 scenarios

2. **realtime-turn-exchange** — Turn payload delivery and concurrency
   - Both-racers-locked, no double-spending
   - Handles disconnection mid-turn
   - All 9 requirements in 13 scenarios

3. **realtime-reaction-window** — Reaction availability and expiry
   - 15-second window; expiry preserves the reaction
   - Skill selection clears it; missing skillCode signals "no reaction spent"
   - All 9 requirements in 16 scenarios

4. **realtime-battle-recovery** — Reconnection and state restoration
   - Reconnect with same JWT within 2-minute window
   - Returns serialized state: result (if closed), current turn, reaction deadline
   - Accepts only `IN_PROGRESS` battles; rejects `FINISHED` or `ABANDONED`
   - All 9 requirements in 9 scenarios

Total: 36 requirements, 52 scenarios.

## Key Findings Worth Recording

### 1. Persisted Deadline is Load-bearing

The deadline column (`reactionDeadline`, `disconnectDeadline`) is not optional even though a timer exists in-memory. Render's free tier sleeps after 15 minutes of inactivity, killing the Node process and its `setTimeout`. Without the persisted deadline, the turn would hang forever on reconnection or server restart.

### 2. Atomic Compare-and-Clear is Essential for Concurrency

The unique index `@@unique([battleId, round, sequence])` alone is NOT enough. If both racers send their turns in quick succession before either write, both would pass the index check and proceed to read randomness, causing double-spending. The fix: statement 1 of the transaction must atomically compare and clear the claim (e.g., `updateMany` with a WHERE that names the current state). This re-evaluates under READ COMMITTED against the live database, serializing the racers. Test `test/turn-resolution-concurrency.e2e-spec.ts` proves this on real infrastructure.

### 3. Reaction Spending is Signalled by Absence

The engine never writes `reactionAvailable = false`; only `startRound` writes it, always to `true`. Spending the reaction is the gateway's job, indicated by `turns[1].skillCode !== null`. A null skillCode means the reaction was not spent. This single rule makes all three "reaction preserved" cases fall out with no special-case logic.

### 4. Three Distinct Shapes of "Green Tests, Broken System"

During implementation, three patterns emerged that passed `pnpm test` but broke production:
- **isolatedModules**: TypeScript error hidden by module isolation flag
- **Unapplied migration**: Column missing at runtime even though schema is updated
- **Provider injected but not registered**: NestJS module loads 414 unit tests while `bootstrap()` throws

None of these are specific to real-time battle; they are systemic traps in the test suite that deserve follow-up.

### 5. Spec Gap Found and Fixed During Slice 7

During slice 7 delivery (commit 88f9d64), a spec gap was discovered: `JOIN_STATUSES` excluded `FINISHED`, so a participant could not rejoin a finished battle to read the result. The recovery spec required this. Fixed with a RED test first, then implementation. Verified during slice 7 apply.

## Accepted Limitations

A battle that both players abandon forever stays `IN_PROGRESS` until one of them next sends a message. Closure is evaluated lazily on reconnection, not by background sweep. This is acceptable because:
- The use case is rare (both players disappear before disconnect timeout)
- A background sweep adds operational complexity and persistence cost
- The next player message triggers evaluation at no extra cost
- This behavior is documented and deterministic

## Known Unrelated Flake

**Pre-existing**: `security.e2e-spec.ts` has two rate-limiting tests that fail when the e2e suite runs repeatedly in a short window. The credential limiter allows 5 attempts with a fixed window that doesn't clear between runs. This is not caused by this change and should be addressed in a separate follow-up.

## Artifact Lineage

All change artifacts are preserved in this archive folder:

- `proposal.md` — Phase 6 intent and success criteria (Engram obs #260)
- `design.md` — Three sequence diagrams, D1 & D2 decisions, findings (Engram obs #262)
- `specs/` — Four delta specs promoted to live (copies in `openspec/specs/`) (Engram obs #261)
- `tasks.md` — Nine slices with per-task state and metrics (Engram obs #264)
- `apply-progress.md` — State after each slice apply
- `verify-report.md` — Full verification report with evidence (Engram obs #273)
- `exploration.md` — Research and analysis from Phase 6 proposal

## Engram Observation IDs

| Artifact | Engram Obs | Scope |
|----------|-----------|-------|
| Proposal | #260 | sdd/add-realtime-battle/proposal |
| Spec (delta) | #261 | sdd/add-realtime-battle/spec |
| Design | #262 | sdd/add-realtime-battle/design |
| Tasks | #264 | sdd/add-realtime-battle/tasks |
| Verify Report | #273 | sdd/add-realtime-battle/verify-report |
| Archive Report | (this file) | sdd/add-realtime-battle/archive-report |

## Archive Closure

This change is now closed. The four capabilities are live, all tests pass, verification is complete, and all artifacts are in the archive folder. Future modifications to real-time battle mechanics will be new changes, not continuations of this one.

**Status**: ARCHIVED  
**Date**: 2026-09-01  
**Final commit**: main@23c2275 (PR #44 merged)

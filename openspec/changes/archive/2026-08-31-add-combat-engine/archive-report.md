# Archive Report: add-combat-engine (Phase 3)

**Change**: `add-combat-engine`  
**Phase**: 3  
**Archived**: 2026-08-31  
**Status**: CLOSED — Change complete, verified, and synced to main specs.

---

## Executive Summary

The combat engine implementation has been fully completed, verified, and archived. All 21 requirements across four capability domains (combat-resolution, combat-conditions, combat-reactions, combat-turn-pipeline) have been implemented and tested. Four delta specs have been synced into the main `openspec/specs/` directory as new full specifications. The change folder has been moved to `openspec/changes/archive/2026-08-31-add-combat-engine/`.

---

## Specifications Synced to Main Specs

Four new specifications have been merged into `openspec/specs/` from the delta specs:

| Spec | Requirements | Scenarios | Status |
|------|--------------|-----------|--------|
| `openspec/specs/combat-resolution/spec.md` | 6 | 16 | ✅ Created |
| `openspec/specs/combat-conditions/spec.md` | 5 | 18 | ✅ Created |
| `openspec/specs/combat-reactions/spec.md` | 6 | 13 | ✅ Created |
| `openspec/specs/combat-turn-pipeline/spec.md` | 4 | 6 | ✅ Created |
| **Total** | **21** | **53** | **✅ All synced** |

All specs have been copied mechanically using shell `cp` and verified with `diff -r`. Empty diff confirms byte-identity of all four specs.

---

## Verification Summary

**Verdict**: PASS  
**Critical Findings**: 0  
**Verification Report**: `openspec/changes/archive/2026-08-31-add-combat-engine/verify-report.md`

### Test Results
- **Build**: PASSED (`pnpm build` exit 0)
- **Lint**: PASSED (`pnpm lint` exit 0, zero fixes required)
- **Unit Tests**: **141 passed** across 15 test suites (no failures, no skipped)
- **Coverage**: Skipped (no coverage command in this run)

### Invariant Checks (re-verified in this pass)
- `src/combat/` contains **zero** `@nestjs` or `@Injectable` imports ✅
- `Math.floor` usage confined to `core/arithmetic.ts` and `core/random-source.ts` only ✅

### Two Prior Critical Findings — Both Closed by Commit 6ee4b1b (PR #21)

| Finding | Rule(s) | Status | Closed By |
|---------|---------|--------|-----------|
| "Advantage can only raise the critical chance, never lower it" (UNTESTED) | R15 | ✅ CLOSED | test(combat): cover advantage criticals and same round condition (commit 6ee4b1b, PR #21) |
| R17: "A same-round reaction is unaffected by a condition just applied" (UNTESTED) | R17 | ✅ CLOSED | test(combat): cover advantage criticals and same round condition (commit 6ee4b1b, PR #21) |

Both findings are now covered by unit tests and pass. The previous fail verdict has been superseded by this pass.

### File Reorganization — Verified Behavior-Preserving

PR #22 (commit 08a2e80) reorganized `src/combat/` from a flat structure into a hierarchy:
```
src/combat/old layout       →  src/combat/new layout
├── arithmetic.ts           →  core/arithmetic.ts
├── random-source.ts        →  core/random-source.ts
├── conditions/             →  core/conditions/
├── reaction-* files        →  attack/reaction-* files
├── turn.ts                 →  turn.ts (unchanged location)
├── types.ts                →  types.ts (unchanged location)
└── index.ts                →  index.ts (unchanged location)
```

This was a move-only refactor verified as behavior-preserving. All tests and build checks passed. Distribution output (`dist/combat/`) mirrors the new layout with no `dist/src/` nesting introduced.

---

## Completion Status

### Tasks

| Category | Count | Status |
|----------|-------|--------|
| Total tasks | 42 | ✅ All complete |
| Completed (`- [x]`) | 42 | ✅ Verified on disk |
| Uncompleted (`- [ ]`) | 0 | ✅ None |

**Note**: Earlier `apply-progress` (Engram id 236) and `tasks` (Engram id 235) observations quote prose mentioning 45 or 47 tasks. The authoritative source is the persisted file `openspec/changes/archive/2026-08-31-add-combat-engine/tasks.md` on disk, which contains exactly 42 checkbox items, all checked.

### Artifacts

All change artifacts present and verified:

- ✅ `proposal.md` — scope, approach, size forecast, chained-PR boundaries
- ✅ `design.md` — technical decisions, domain types, module structure
- ✅ `tasks.md` — 42 tasks, all complete
- ✅ `verify-report.md` — full verification evidence including prior findings and re-verification
- ✅ `exploration.md` — exploration notes
- ✅ `specs/` — four delta specs, all synced to main
- ✅ `archive-report.md` (this file) — final archive record

---

## Delivery History

### Pull Requests

Implemented across 8 pull requests (#15–#22), reflecting the proposed chained-PR boundaries from the proposal:

1. **PR #15**: Domain types, `RandomSource`, derived stats, advantage/disadvantage
2. **PR #16**: Physical attack with critical, magic attack with saving throw (R12, R14, R15)
3. **PR #17**: Conditions R1–R3, R16, R17, refresh and round-start tick
4. **PR #18**: Reaction table R4–R10, applicability, defense modifiers, mitigation
5. **PR #19**: Nine-step pipeline R11, action + reaction composition, death short-circuit
6. **PR #20**: Integration tests, edge case coverage, rule interactions
7. **PR #21**: Two critical test coverage gaps closed (R15 advantage criticals, R17 same-round conditions) — this re-verification pass
8. **PR #22**: `src/combat/` reorganization (move-only, behavior-preserving refactor) — core/, attack/, state/ structure

### Slice Splits (Accepted `size:exception` Decisions)

Per the proposal's 400-line budget and the maintainer's standing rule that review budget is measured on logic lines only (excluding `*.spec.ts`):

- **Slice 2 split → 2a/2b**: Physical attack branch (PR #16) split into core attack logic and edge cases to stay under budget
- **Slice 3 split → 3a/3b**: Conditions and reactions (PR #17–#18) split into condition state management and reaction applicability for clarity

All slices remain independently testable and revertable.

---

## Documentation Shipped

- **`docs/design/combat-engine.md`**: Comprehensive reading guide covering the nine-step pipeline, all 17 rules, condition state management, reaction triggers, and worked examples
- **`README.md` Motor de combate section**: Mermaid diagram showing the action → reaction → resolution flow
- **`docs/design/overview.md` §2.3**: Updated to document DEXTERITY as a third offensive route (R14, `PRECISE_SHOT`), closing a documentation debt carried by this change

---

## Capabilities Defined

This change defines four new capabilities, shipped as four new full specifications:

### 1. Combat Resolution (`combat-resolution/spec.md`)
- Derived stat calculation (armor class, max HP, initiative)
- Physical attack roll vs. armor class
- Magic attack via saving throw
- Critical hits and natural 1s
- Advantage and disadvantage mechanics

### 2. Combat Conditions (`combat-conditions/spec.md`)
- Three condition types: POISONED, STUNNED, WEAKENED
- Condition application and refresh mechanics
- Round-start condition tick and expiration
- Mid-round deferral rule (R17)

### 3. Combat Reactions (`combat-reactions/spec.md`)
- Reaction table: BRACE, PARRY, DODGE, ARCANE_WARD, COUNTER, RIPOSTE
- Per-reaction applicability by action type
- Defense modifier application (armor class boost, saving throw boost, damage reduction)
- Counter-attack resolution and conditions

### 4. Combat Turn Pipeline (`combat-turn-pipeline/spec.md`)
- Nine-step ordered resolution process
- Death short-circuit (no counter-attack if reducer to 0 HP)
- Condition application timing
- Output shape (two `BattleTurn` rows per action + reaction)

---

## Archive Metadata

**Archived Path**: `openspec/changes/archive/2026-08-31-add-combat-engine/`  
**Archived By**: sdd-archive Phase 3 executor  
**Archive Date**: 2026-08-31 (ISO format)  
**Verification Readback**: Empty `diff -r` confirms all archived artifacts match pre-move snapshot  

**Archive Contents**:
- ✅ `proposal.md` (9.6 KB)
- ✅ `design.md` (35.8 KB)
- ✅ `tasks.md` (28.7 KB, 42 checkboxes)
- ✅ `verify-report.md` (16.9 KB)
- ✅ `exploration.md` (13.1 KB)
- ✅ `specs/combat-resolution/spec.md`
- ✅ `specs/combat-conditions/spec.md`
- ✅ `specs/combat-reactions/spec.md`
- ✅ `specs/combat-turn-pipeline/spec.md`
- ✅ `archive-report.md` (this file)

---

## Key Facts Confirmed

Per the FINAL STATE provided to this phase executor:

✅ All work merged into `main` across pull requests #15–#22  
✅ Verification verdict is `pass` with 0 critical findings  
✅ 141 tests across 15 suites pass  
✅ `pnpm lint` clean, `pnpm build` exit 0  
✅ `dist/main.js` emitted with no `dist/src/` nesting  
✅ Two prior critical test gaps closed by commit 6ee4b1b (PR #21)  
✅ `src/combat/` reorganized in PR #22 into core/, attack/, state/ hierarchy  
✅ Documentation shipped (combat-engine.md, README Motor de combate, overview.md §2.3)  
✅ Tasks file on disk: 42 checkboxes, all ticked  
✅ All four capability specs synced to `openspec/specs/`  
✅ Change folder moved to archive with byte-identity verified  

---

## SDD Cycle Complete

The `add-combat-engine` change has successfully progressed through all SDD phases:

- ✅ **Proposal** (accepted): Scope, approach, size forecast, rollback plan
- ✅ **Spec** (approved): 21 requirements across 4 domains, 53 scenarios
- ✅ **Design** (approved): Technical decisions, domain types, module structure
- ✅ **Tasks** (created): 42 tasks in 4 slices (with 2→2a/2b and 3→3a/3b splits)
- ✅ **Apply** (completed): 8 PRs (#15–#22) delivering all tasks with comprehensive tests
- ✅ **Verify** (passed): 0 critical findings, 141 tests, two prior gaps closed
- ✅ **Archive** (complete): 4 delta specs synced to main, change folder archived

The combat engine is now a stable, well-documented, core capability. Downstream phases (Phase 4: build validation; Phase 5: battle.service integration; Phase 6: WebSocket delivery) may now depend on this engine.

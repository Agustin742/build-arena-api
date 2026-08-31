```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:d9a6ced2c6cbce6bfaf7d4ad4b06717746e60f49c1c1bd3312c8ba10e0128345
verdict: pass
blockers: 0
critical_findings: 0
requirements: 21/21
scenarios: 53/53
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:0b00c769ef436f129027ea80daec335981590519351a9c71393eb7fea495e171
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:e6e853208d87502ddef751ad159d4be8961b361ba633cf9202bd527fd8659d4f
```

## Verification Report

**Change**: add-combat-engine (Phase 3)
**Version**: N/A (delta specs, no prior baseline in openspec/specs/)
**Mode**: Strict TDD
**Re-verification**: scoped delta re-verification of the two prior CRITICAL findings, the PR #22
move-only reorganization, and the four hard invariant/build checks. This supersedes the fail
verdict recorded in the previous pass; the 51 scenarios previously graded COMPLIANT were not
re-audited and remain trusted from that pass.

### History of this report

| Pass | Verdict | Critical findings | Note |
|---|---|---|---|
| 1 (this file, prior version) | FAIL | 2 | Two UNTESTED spec scenarios: combat-resolution "Advantage can only raise the critical chance, never lower it" and combat-conditions R17 "A same-round reaction is unaffected by a condition just applied." |
| 2 (this pass) | PASS | 0 | Both findings closed by commit 6ee4b1b (test(combat): cover advantage criticals and same round condition), merged in PR #21. Structure re-confirmed intact after the move-only src/combat/ reorganization in commit 08a2e80 (PR #22). |

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (checkbox items in tasks.md) | 42 |
| Tasks complete | 42 |
| Tasks incomplete | 0 |

Note (carried from the prior pass, not re-audited): cumulative apply-progress narrative
(Engram #236) and the tasks artifact mirror (Engram #235) both quote task-count prose elsewhere
that does not match the file; the authoritative openspec/changes/add-combat-engine/tasks.md file
on disk contains exactly 42 checkbox items, all checked, 0 unchecked. Not a completion defect.
Still flagged as SUGGESTION below, unchanged from the prior pass since it was outside this
re-verification's scope.

### Build and Tests Execution (re-run this pass)

**Build**: PASSED
```text
$ pnpm build
$ prisma generate && nest build
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
Generated Prisma Client (7.10.0) to .\src\generated\prisma
Exit code: 0
```
dist/main.js exists. dist/src/ does not exist (confirmed). dist/combat/ now mirrors the
PR #22 reorganization -- attack/, core/, state/ subfolders plus turn.js/types.js/
index.js at the top level -- matching src/combat/'s new layout 1:1. No dist/src/ nesting
was introduced by the refactor.

**Tests**: 141 passed / 0 failed / 0 skipped, across 15 suites (up from 139/139/15 in the prior
pass -- the two new closing tests)
```text
$ pnpm test
$ jest
Test Suites: 15 passed, 15 total
Tests:       141 passed, 141 total
Snapshots:   0 total
Time:        6.301 s
Ran all test suites.
Exit code: 0
```

**Lint**: pnpm lint -- exit 0, zero fixes required, git status --short empty afterward (no
residual changes from --fix).

**Coverage**: not requested/available via a dedicated coverage command in this run; not run.
Reported as "Coverage analysis skipped -- no coverage command executed" per graceful handling
(unchanged from the prior pass).

### Hard Invariant Checks (real command output, re-run this pass)

```text
$ rg "@nestjs|@Injectable" src/combat/
(no output, exit 1 -- zero matches, invariant holds)

$ rg "Math.floor" src/combat/
src/combat/core/arithmetic.ts (comment: other Math.floor under src/combat/ lives in random-source.ts)
src/combat/core/arithmetic.ts: modifier = Math.floor((score - 10) / 2)
src/combat/core/arithmetic.ts: halve = Math.floor(value / 2)
src/combat/core/random-source.ts: Math.floor(Math.random() * faces) + 1
(confined to core/arithmetic.ts and core/random-source.ts -- invariant holds after the PR #22 move)
```

Both invariants held in the prior pass when the files lived flat under src/combat/; both still
hold now that arithmetic.ts and random-source.ts live under src/combat/core/. No new
Math.floor or NestJS/DI usage was introduced anywhere else in src/combat/.

### Reorganization Regression Check (PR #22, commit 08a2e80)

| Check | Result |
|---|---|
| Same modules exist, only regrouped | CONFIRMED. src/combat/attack/damage,magic-attack,physical-attack.ts, src/combat/core/arithmetic,d20,derived-stats,random-source.ts, src/combat/state/conditions,reactions,round.ts, plus turn.ts/types.ts/index.ts at the top level. Every module named in the design's File Layout table is present, just under a subfolder. |
| Barrel index.ts still exports everything | CONFIRMED. export star from statements for all 12 modules are present and unchanged in intent (only import paths were updated to the new subfolders). |
| Behavior unchanged (move-only) | CONFIRMED. git log --oneline shows 08a2e80 as a single "regroup engine modules" commit; pnpm test still passes 141/141 (139 pre-existing + 2 new from 6ee4b1b, both merged before the move); pnpm build and pnpm lint are clean; the six source-level rule checks from the prior pass (round-start tick order, critical doubling, BRACE floor, POISONED save-difficulty scoping, natural 20/1 pre-AC resolution, no-COUNTER-on-death) were re-read at their new paths (src/combat/state/round.ts, src/combat/attack/damage.ts, src/combat/attack/magic-attack.ts, src/combat/attack/physical-attack.ts, src/combat/turn.ts) and are textually identical to the versions graded CORRECT in the prior pass. |
| Invariants (nestjs/Injectable, confined Math.floor) | CONFIRMED, see Hard Invariant Checks above. |

No regression found from the reorganization.

### Spec Compliance Matrix -- delta only (the two previously UNTESTED scenarios)

Legend: COMPLIANT (covering test passed at runtime) / UNTESTED (no covering test found). The
remaining 51 scenarios were graded in the prior pass and are not re-audited here.

| Requirement | Scenario | Test | Result (prior) | Result (this pass) |
|---|---|---|---|---|
| Advantage and Disadvantage | Advantage can only raise the critical chance, never lower it | physical-attack.spec.ts: "advantage keeps the natural 20 and criticals, so advantage can only raise the critical chance" | UNTESTED | COMPLIANT |
| Condition Applied Mid-Round Has No Effect That Round (R17) | A same-round reaction is unaffected by a condition just applied | turn.spec.ts: "a condition applied this round never reaches the same round's reaction (R17)" | UNTESTED | COMPLIANT |

**Compliance summary**: 53/53 scenarios compliant, 0 UNTESTED, across 21/21 requirements.

### Finding 1 -- closure evidence (combat-resolution / Advantage and Disadvantage)

Source: src/combat/attack/physical-attack.spec.ts, test "advantage keeps the natural 20 and
criticals, so advantage can only raise the critical chance" (lines 142-167).

- Exercises bias: ADVANTAGE against random.rollD20 mocked mockReturnValueOnce(20)
  .mockReturnValueOnce(5) -- the exact die values the spec scenario names (20 then 5).
- Asserts the composed result: result.rolls equals [20, 5], result.kept is 20,
  result.critical is true, result.hit is true.
- Load-bearing, confirmed by source reading of rollD20With (src/combat/core/d20.ts):
  under NORMAL bias, rollD20With calls random.rollD20() exactly once and returns
  rolls: [only], kept: only; under ADVANTAGE/DISADVANTAGE it calls random.rollD20()
  twice and keeps the max/min. If this test's bias were forced to NORMAL against the same
  mock, random.rollD20 would be called once (not twice) and result.rolls would equal [20]
  (not [20, 5]) -- both of which the test explicitly asserts
  (expect(random.rollD20).toHaveBeenCalledTimes(2), expect(result.rolls).toEqual([20, 5])).
  The test fails under a NORMAL-bias regression, so it is genuinely load-bearing for the
  two-roll advantage mechanism, not just for the final kept/critical values.
- Verdict: CLOSED. The scenario as literally worded in the spec (natural 20 kept under
  ADVANTAGE composes into critical: true) now has a passing runtime test that would fail if the
  advantage mechanism regressed.

### Finding 2 -- closure evidence (combat-conditions / R17)

Source: src/combat/turn.spec.ts, test "a condition applied this round never reaches the same
round's reaction (R17)" (lines 755-792).

- Scenario construction matches the spec literally: actor casts VENOM_BOLT (magic) on defender
  in round 3; defender's saving throw (constitution 8, mod -1) rolls a mocked 5, total 4,
  fails against difficulty 9; POISONED lands on the defender (roundsRemaining: 3, asserted via
  result.defender.conditions). The defender's declared reaction is COUNTER, which fires on the
  same turn because the failed save counts as a hit.
- Asserts rollD20 was called exactly once for the whole turn
  (expect(rollD20).toHaveBeenCalledTimes(1)) -- the only d20 roll in the turn is the defender's
  saving throw; the reaction's resolution never rolls again.
- Asserts the reaction's own output is the plain unbiased value: result.turns[1].damage is 6
  (COUNTER's 1d6 mocked 4 plus modifier(strength 14) = +2, with no disadvantage-driven change),
  and both combatants' final HP (actor.currentHp 24, defender.currentHp 22) are asserted exactly.
- Would fail if a reaction rolled a biased d20: any code path that made the reaction consult
  attackBiasFor/rollD20With a second time would raise the rollD20 call count to 2 or more,
  breaking toHaveBeenCalledTimes(1) immediately, regardless of what value the mock returned.
- Cross-checked against source (src/combat/turn.ts, src/combat/state/reactions.ts): no entry
  in REACTION_TABLE (BRACE, PARRY, DODGE, ARCANE_WARD, COUNTER, RIPOSTE) ever calls
  random.rollD20(); attackBiasFor is invoked exactly once, for the acting combatant's own
  action roll (turn.ts line 149), never for a reaction. This means R17 holds both by the
  structural argument already noted in the prior pass AND is now additionally pinned by a
  runtime test that would catch a regression introducing a biased reaction roll.
- Verdict: CLOSED. One caveat carried forward for transparency: because no reaction in this
  engine ever rolls a d20 at all, the scenario's "does not impose disadvantage on that reaction's
  own rolls, if any" is satisfied both by direct assertion (call count 1) and, for this specific
  reaction, vacuously (COUNTER has no roll to bias). The test still meets this phase's bar --
  "a spec scenario is compliant only when a covering test passed at runtime" -- because it
  directly asserts the observable guarantee (exactly one d20 roll all turn, unbiased
  damage/HP), not just static source structure.

### Correctness (Static Evidence -- re-confirmed only where paths moved)

The six rule checks from the prior pass were re-read at their post-reorganization paths and are
unchanged in content:

| Rule checked | Source location (current) | Result |
|---|---|---|
| Round-start tick removes expired conditions before decrementing survivors | src/combat/state/round.ts | CORRECT (unchanged) |
| A critical rolls the skill's own notation twice, summed | src/combat/attack/damage.ts | CORRECT (unchanged) |
| BRACE's floor of 1 applies to the reduction, not the resulting damage | src/combat/attack/damage.ts | CORRECT (unchanged) |
| POISONED subtracts 2 from the saving throw difficulty the bearer imposes, never a save the bearer rolls | src/combat/attack/magic-attack.ts | CORRECT (unchanged) |
| A natural 20 hits and a natural 1 misses before armor class is consulted | src/combat/attack/physical-attack.ts | CORRECT (unchanged) |
| A fallen defender's COUNTER never fires | src/combat/turn.ts | CORRECT (unchanged) |

### Coherence (Design)

Unchanged from the prior pass; not re-audited beyond the reorganization check above (design.md's
File Layout table already anticipated grouped subfolders under "File Layout", and PR #22's move
does not introduce a new deviation).

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Unchanged from prior pass; commit 6ee4b1b is a single test-only commit closing both gaps, consistent with tasks.md's "NO SEPARATE COMMIT" pattern already disclosed for slice 4. |
| All tasks have tests | Yes | Unchanged. |
| RED confirmed (tests exist) | Yes | All spec.ts files exist at their (moved) paths, confirmed via ls. |
| GREEN confirmed (tests pass) | Yes | pnpm test -- 141/141 passing, 15/15 suites, re-run in this verification session. |
| Triangulation adequate | Yes | Unchanged; the two new tests add distinct expected values (kept=20/critical=true; rollD20 called once/damage=6) not previously asserted anywhere. |
| Safety Net for modified files | N/A | 6ee4b1b only adds test cases to two existing spec files; 08a2e80 is a pure file move (git tracks both as renames), no behavior touched. |

**TDD Compliance**: 5/5 applicable checks passed.

### Assertion Quality (delta)

Both new tests were scanned for banned patterns (tautologies, orphan empty checks, ghost loops,
smoke-test-only, mock/assertion ratio): none found. Both call the production function under test
directly (resolvePhysicalAttack, resolveTurn) and assert concrete computed values (exact
roll arrays, exact kept/critical/hit booleans, exact damage and HP numbers, exact call
counts tied to the mechanism being proven), not type-only or tautological checks.

**Assertion quality**: 0 CRITICAL, 0 WARNING (delta and cumulative).

### Quality Metrics

**Linter**: No errors -- pnpm lint exit 0, zero --fix changes applied (confirmed via
git status --short immediately after).
**Type Checker**: No errors -- pnpm build (which runs nest build, a full tsc type-check via
Nest CLI) exits 0.

### Issues Found

**CRITICAL**: None.

**RESOLVED (carried forward for history)**:
1. combat-resolution scenario "Advantage can only raise the critical chance, never lower it" --
   was UNTESTED in the prior pass. Closed by commit 6ee4b1b, merged in PR #21. See "Finding 1
   -- closure evidence" above.
2. combat-conditions R17 scenario "A same-round reaction is unaffected by a condition just
   applied" -- was UNTESTED in the prior pass. Closed by commit 6ee4b1b, merged in PR #21. See
   "Finding 2 -- closure evidence" above.

**WARNING**:
1. Task-count drift across artifacts (unchanged, out of this re-verification's scope): Engram
   sdd/add-combat-engine/tasks (#235) states "45 tasks total," Engram
   sdd/add-combat-engine/apply-progress (#236) states "47/47 total tasks complete," but the
   authoritative openspec/changes/add-combat-engine/tasks.md file on disk contains exactly 42
   checkbox items, all checked. Not a completion defect (0 unchecked boxes exist), but the
   narrative counts in two Engram memos still do not match the file they describe. Still open;
   not addressed by the commits reviewed in this pass.
2. (RESOLVED) tasks.md traceability claims for tasks 4.5/4.7 attribute test coverage to
   scenarios that the actually-written tests did not assert -- the tests that now exist in
   physical-attack.spec.ts and turn.spec.ts (added by 6ee4b1b) do assert the scenarios named
   in tasks.md 4.5/4.7. No further action needed.

**SUGGESTION**: None remaining. Both suggestions from the prior pass (add an ADVANTAGE+nat-20
test; add a same-round POISONED-reaction test) were implemented verbatim by commit 6ee4b1b.

### Verdict

**PASS**

All 53 spec scenarios across 21 requirements in the 4 capability files (combat-resolution,
combat-conditions, combat-reactions, combat-turn-pipeline) now have a passing runtime covering
test, closing the two CRITICAL gaps recorded in the prior verification pass. Commit 6ee4b1b
(test(combat): cover advantage criticals and same round condition, merged in PR #21) added
both closing tests; both were confirmed load-bearing by source inspection of the mechanisms they
pin (rollD20With's bias branching; the absence of any rollD20 call anywhere in
REACTION_TABLE's reaction resolution). Commit 08a2e80 (refactor(combat): group engine
modules by what they know, merged in PR #22) regrouped src/combat/ into core/, attack/,
and state/ subfolders; this was confirmed to be a pure move with no behavior change -- all 141
tests still pass, pnpm lint and pnpm build are clean, the barrel index.ts still exports
every module, and both hard invariants (no NestJS/DI in src/combat/; Math.floor confined to
core/arithmetic.ts and core/random-source.ts) hold at the new paths. dist/main.js exists
and dist/src/ does not. One WARNING (Engram task-count-prose drift) remains open but is
documentation-only and does not block archive; the prior pass's second WARNING (traceability
mismatch) is now resolved because the traceability claims match the tests that exist.

This change is ready to archive.

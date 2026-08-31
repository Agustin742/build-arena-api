```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:a6c4782ef754ac362ea838559a6cf397a9d61fb8f9c7ba25397b724869b54b5b
verdict: fail
blockers: 2
critical_findings: 2
requirements: 19/21
scenarios: 51/53
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:442914dd1316986de21b837c807c8d150e598fc16de672276840e7c53b3fb1f8
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:c698e8f716bc4ce5b0b089099072037114257345393cd80c5c8d35c76551b65f
```

## Verification Report

**Change**: add-combat-engine (Phase 3)
**Version**: N/A (delta specs, no prior baseline in openspec/specs/)
**Mode**: Strict TDD

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total (checkbox items in tasks.md) | 42 |
| Tasks complete | 42 |
| Tasks incomplete | 0 |

Note: cumulative apply-progress narrative (Engram #236) and the tasks artifact mirror (Engram
#235) both quote a "47" total elsewhere in prose; the actual openspec/changes/add-combat-engine/tasks.md
file on disk contains exactly 42 checkbox items (- [x]), and all 42 are checked, 0 unchecked.
This is a documentation-count drift across memos, not an incomplete-task defect -- every checkbox
present in the authoritative file is done. Flagged as SUGGESTION below.

### Build and Tests Execution

**Build**: PASSED
```text
$ pnpm build
$ prisma generate && nest build
Loaded Prisma config from prisma.config.ts.
Prisma schema loaded from prisma\schema.prisma.
Generated Prisma Client (7.10.0) to .\src\generated\prisma
Exit code: 0
```
dist/main.js exists. dist/src/ does not exist (confirmed via ls). dist/combat/ contains
one compiled .js/.d.ts pair per src/combat/*.ts module (14 modules), no nested src/.

**Tests**: 139 passed / 0 failed / 0 skipped, across 15 suites
```text
$ pnpm test
$ jest
Test Suites: 15 passed, 15 total
Tests:       139 passed, 139 total
Snapshots:   0 total
Time:        5.006 s
```

**Lint**: pnpm lint -- exit 0, zero fixes required, git status --short empty afterward (no
residual changes from --fix).

**Coverage**: not requested/available via a dedicated coverage command in this run; not run.
Reported as "Coverage analysis skipped -- no coverage command executed" per graceful handling.

### Hard Invariant Checks (real command output)

```text
$ rg "@nestjs|@Injectable" src/combat/
(no output, exit 1 -- zero matches, invariant holds)

$ rg "Math\.floor" src/combat/
src/combat/random-source.ts:    return Math.floor(Math.random() * faces) + 1;
src/combat/arithmetic.ts: * other Math.floor under src/combat/ lives in random-source.ts, for
src/combat/arithmetic.ts:export const modifier = (score: number): number => Math.floor((score - 10) / 2);
src/combat/arithmetic.ts:export const halve = (value: number): number => Math.floor(value / 2);
(confined to arithmetic.ts and random-source.ts -- invariant holds)
```

### Spec Compliance Matrix

Legend: COMPLIANT (covering test passed at runtime) / UNTESTED (no covering test found).

#### combat-resolution (5 requirements / 16 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Derived Stat Calculation | Armor class and max HP from frozen attributes | derived-stats.spec.ts > armorClass/maxHp "matches the spec scenario..." | COMPLIANT |
| Physical Attack Resolution vs AC | Hit with POWER_STRIKE | physical-attack.spec.ts > "hits and deals damage when the target value meets armor class" | COMPLIANT |
| Physical Attack Resolution vs AC | Miss with POWER_STRIKE | physical-attack.spec.ts > "misses and rolls no damage dice when the total falls short" | COMPLIANT |
| Physical Attack Resolution vs AC | Natural 20 is an automatic critical hit | physical-attack.spec.ts > "a natural 20 is an automatic critical hit even against a high armor class (Decision E)" | COMPLIANT |
| Physical Attack Resolution vs AC | Natural 1 is an automatic miss | physical-attack.spec.ts > "a natural 1 is an automatic miss even when the total would meet armor class (Decision E)" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | Failed save takes full damage | magic-attack.spec.ts > "fails a save that falls short and takes full damage on the failed save" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | Successful save halves damage, rounding down | magic-attack.spec.ts > "halves damage, rounding down, on a save that meets the difficulty" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | Natural 20 save is an ordinary success | magic-attack.spec.ts > "treats a natural 20 save as an ordinary success, with no special negation (R12/Decision 4)" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | Natural 1 save is an ordinary failure | magic-attack.spec.ts > "treats a natural 1 save as an ordinary failure, with no special critical failure (R12/Decision 4)" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | A POISONED attacker lowered difficulty turns a failed save into a successful one | magic-attack.spec.ts > "turns a failed save into a successful one when the attacker is POISONED (Decision G)" | COMPLIANT |
| Magic Attack Resolution via Saving Throw | The POISONED penalty lowers the difficulty imposed, never a save the bearer makes | magic-attack.spec.ts > "never lowers the difficulty from the defender being POISONED, only from the attacker (Decision G)" | COMPLIANT |
| Advantage and Disadvantage | Advantage keeps the higher roll | d20.spec.ts > "keeps the higher roll under ADVANTAGE" | COMPLIANT |
| Advantage and Disadvantage | Disadvantage keeps the lower roll | d20.spec.ts > "keeps the lower roll under DISADVANTAGE" | COMPLIANT |
| Advantage and Disadvantage | Advantage and disadvantage cancel | d20.spec.ts > "resolveBias cancellation collapses ADVANTAGE+DISADVANTAGE into a single roll via rollD20With" | COMPLIANT |
| Advantage and Disadvantage | Advantage can only raise the critical chance, never lower it | (none found) | UNTESTED |
| Resolving Attribute (R14) | PRECISE_SHOT resolves with dexterity, not strength | physical-attack.spec.ts > "resolves PRECISE_SHOT with dexterity, not strength (R14)" | COMPLIANT |

#### combat-conditions (7 requirements / 16 scenarios)

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| POISONED Disadvantage + Save Difficulty (R1, Decision G) | A poisoned attacker rolls with disadvantage | conditions.spec.ts > "gives a poisoned attacker disadvantage on physical attack rolls (R1)" | COMPLIANT |
| POISONED Disadvantage + Save Difficulty (R1, Decision G) | A poisoned magic attacker imposes a difficulty lowered by 2 | magic-attack.spec.ts > "is lowered by 2 while the attacker is POISONED (Decision G)" | COMPLIANT |
| POISONED Disadvantage + Save Difficulty (R1, Decision G) | The -2 never reaches a physical attack | conditions.spec.ts > "never lowers the target armor class for a poisoned physical attacker (R1, Decision G)" | COMPLIANT |
| STUNNED Removes Action and Reaction (R2, Decision B) | A stunned actor action is recorded as skipped, not empty | turn.spec.ts > "a stunned actor's action is recorded as skipped, not empty (R2, Decision B)" | COMPLIANT |
| STUNNED Removes Action and Reaction (R2, Decision B) | A stunned defender cannot use a reaction | turn.spec.ts > "a stunned defender cannot use a reaction: PARRY is ignored and its mitigation does not apply" | COMPLIANT |
| WEAKENED Halves Damage Dealt (R3) | A weakened attacker deals half damage | damage.spec.ts > "halves damage for a WEAKENED dealer (R3)" | COMPLIANT |
| Magic Skill Condition on Failed Save (R13) | Failed save applies the condition | turn.spec.ts > "failed save applies the condition to the defender (R13)" | COMPLIANT |
| Magic Skill Condition on Failed Save (R13) | Successful save does not apply the condition | turn.spec.ts > "a successful save does not apply the condition, even though half damage still lands (R13)" | COMPLIANT |
| Re-applying Refreshes Duration (R16) | A near-expiring condition is refreshed, not stacked | conditions.spec.ts > "refreshes roundsRemaining instead of stacking a second entry (R16)" | COMPLIANT |
| Condition Applied Mid-Round Has No Effect That Round (R17) | A same-round reaction is unaffected by a condition just applied | (none found -- see gap note below) | UNTESTED |
| Round Start Is a Pure Function (Decision C, F) | The tick reaches the acting combatant conditions only | round.spec.ts > "reaches the acting combatant conditions only, leaving the opponent untouched (Decision F)" | COMPLIANT |
| Round Start Is a Pure Function (Decision C, F) | A duration counts the bearer own turns | round.spec.ts > "consumes a duration over the bearer's own turns: POISONED/3 bites for three turns before it expires" | COMPLIANT |
| Round Start Is a Pure Function (Decision C, F) | An active condition ticks down | round.spec.ts > "ticks an active condition down by one and keeps it active" | COMPLIANT |
| Round Start Is a Pure Function (Decision C, F) | A one-round condition still bites on the turn it was meant to cost | round.spec.ts > "REGRESSION (remove-then-decrement...): a one-round condition still bites on the turn it was meant to cost..." | COMPLIANT |
| Round Start Is a Pure Function (Decision C, F) | A condition expires at the following round start | round.spec.ts > "expires a condition at the following round start once it already reached zero" | COMPLIANT |
| Round Start Is a Pure Function (Decision C, F) | The acting combatant reaction recharges | round.spec.ts > "recharges the acting combatant reaction (Decision C)" | COMPLIANT |

#### combat-reactions (7 requirements / 11 scenarios) -- all COMPLIANT

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Reaction Applicability by Action Type (R4) | DODGE against a magic action does not apply | reactions.spec.ts > "DODGE against a magic action does not apply (R4)" | COMPLIANT |
| BRACE (R5) | BRACE mitigates a hit | damage.spec.ts > "reduces damage by the constitution modifier under BRACE (R5)" | COMPLIANT |
| BRACE (R5) | BRACE never reduces by less than 1 | damage.spec.ts > "never reduces damage by less than 1 under BRACE (R5)" | COMPLIANT |
| PARRY (R6) | PARRY mitigates a physical hit | damage.spec.ts > "halves physical damage under PARRY (R6)" | COMPLIANT |
| PARRY (R6) | WEAKENED and PARRY apply as two independent halvings | damage.spec.ts > "applies WEAKENED and PARRY as two independent halvings, not one combined division (R6)" | COMPLIANT |
| DODGE (R7) | DODGE raises the effective armor class for one attack | turn.spec.ts > "step 1: DODGE raises the effective armor class before the roll is evaluated (R7)" | COMPLIANT |
| ARCANE_WARD (R8) | ARCANE_WARD raises the save total | turn.spec.ts > "ARCANE_WARD adds the magic modifier to the save total, not the difficulty (R8)" | COMPLIANT |
| COUNTER (R9) | COUNTER returns damage after taking a hit | turn.spec.ts > "step 7: COUNTER resolves only after confirming survival, dealing full damage back (R9)" | COMPLIANT |
| COUNTER (R9) | POISONED does not alter a COUNTER counter-attack | turn.spec.ts > "POISONED does not alter a COUNTER counter-attack: no extra rollD20, damage unaffected (R1, R9)" | COMPLIANT |
| RIPOSTE (R10) | RIPOSTE fires on a miss | turn.spec.ts > "RIPOSTE fires on a miss, returns damage, and step 8 applies WEAKENED only after that damage is finalized (R10, R11 step 8)" | COMPLIANT |
| RIPOSTE (R10) | RIPOSTE does not trigger on a hit | turn.spec.ts > "RIPOSTE does not trigger on a hit: no counter damage and no WEAKENED applied" | COMPLIANT |

#### combat-turn-pipeline (2 requirements / 10 scenarios) -- all COMPLIANT

| Requirement | Scenario | Test | Result |
|---|---|---|---|
| Nine-Step Turn Resolution Order (R11) | Step 1 -- defense modifiers apply before the roll | turn.spec.ts > "step 1: DODGE raises the effective armor class before the roll is evaluated (R7)" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 2 -- action roll uses modified armor class | turn.spec.ts > "step 2: the action roll uses the already-modified armor class and hits exactly" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 3 -- damage only after confirmed hit | turn.spec.ts > "step 3: damage is calculated only after a confirmed hit -- a miss rolls no damage dice" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 4 -- mitigation applies to calculated damage | turn.spec.ts > "step 4: BRACE mitigates the calculated damage after the roll (R5)" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 5 -- HP reduced by mitigated value | turn.spec.ts > "step 5: HP is reduced by the mitigated value, not the raw value" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 6 -- death short-circuits before counter-attack | turn.spec.ts > "step 6: death short-circuits before any counter-attack, even with COUNTER declared and a hit" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 7 -- counter-attack only after confirmed survival | turn.spec.ts > "step 7: COUNTER resolves only after confirming survival, dealing full damage back (R9)" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 8 -- conditions applied after counter-attack completes | turn.spec.ts > "RIPOSTE fires on a miss, returns damage, and step 8 applies WEAKENED only after that damage is finalized (R10, R11 step 8)" | COMPLIANT |
| Nine-Step Turn Resolution Order (R11) | Step 9 -- exactly two turn results always emitted | turn.spec.ts > "step 9: exactly two turn results are always emitted, even with no reaction declared" | COMPLIANT |
| Reaction Applied Condition Not Retroactive (R10, R17, R11) | RIPOSTE's WEAKENED does not rewrite the missed action it answered | turn.spec.ts > "RIPOSTE's WEAKENED does not rewrite the missed action it answered (R10, R17, R11)" | COMPLIANT |

**Compliance summary**: 51/53 scenarios compliant, 2 UNTESTED.

### Uncovered Scenarios (explicit gap list)

1. combat-resolution / Advantage and Disadvantage / "Advantage can only raise the critical
   chance, never lower it" -- spec requires: advantage active, rollD20() returns 20 then 5,
   kept value is 20, attack is treated as critical. No test in the repository exercises
   ADVANTAGE bias together with a natural 20 to confirm the composed critical: true result.
   d20.spec.ts's ADVANTAGE test (rolls [7, 15] -> kept 15) never touches a natural 20 or
   critical. turn.spec.ts's only bias+critical composition test
   ("disadvantage can suppress a critical: a discarded natural 20 never counts") exercises
   DISADVANTAGE, not advantage, and proves the opposite direction of this scenario. Verified
   by grep across all *.spec.ts in src/combat/: zero occurrences of 'ADVANTAGE' bias
   combined with a natural-20 roll. tasks.md task 4.5 claims this scenario is covered by
   turn.spec.ts Part C ("bias + critical wiring"), but the test actually written in that part
   is the disadvantage-suppresses-critical case, not the advantage-raises-critical case the spec
   names. This is a genuine documentation-vs-test mismatch: the two scenarios assert opposite
   outcomes (kept=20/critical=true vs. kept=5/critical=false) and only one exists in the suite.

2. combat-conditions / Condition Applied Mid-Round Has No Effect That Round (R17) / "A
   same-round reaction is unaffected by a condition just applied" -- spec requires: a combatant
   is hit by VENOM_BOLT in round 3, fails the save, POISONED is applied to them; later in round 3
   that same combatant's own reaction resolves, and POISONED's disadvantage must not bite on that
   reaction's own rolls. No test asserts this literal sequence (POISONED applied to a defender,
   then that same defender using a reaction later in the same round with disadvantage confirmed
   absent). The two tests tagged R17 in the suite are: (a) turn.spec.ts's "PIN: nothing rolls
   after step 8" -- a structural regression guard unrelated to POISONED, and (b) turn.spec.ts's
   "RIPOSTE's WEAKENED does not rewrite the missed action it answered" -- this covers the
   combat-turn-pipeline spec's own, differently-worded R17 requirement (a reaction's applied
   condition not rewriting the already-resolved action), a distinct scenario in a different spec
   file. Mitigating factor found by source inspection (not a substitute for a test): in turn.ts,
   attackBiasFor(actor) is only invoked once, for the actor's own action roll; no reaction in
   REACTION_TABLE ever calls random.rollD20() (BRACE/PARRY/DODGE/ARCANE_WARD roll nothing,
   COUNTER/RIPOSTE trigger automatically per R9/R10), so the condition this scenario worries
   about is structurally unreachable in the current engine. That argument is sound but it is
   source-code reasoning, not a passing runtime test, so per this phase's rule ("a spec scenario
   is compliant only when a covering test passed at runtime") it is reported as UNTESTED.

No other scenario among the 53 retrieved from the four spec files is uncovered.

### Correctness (Static Evidence -- the six rule checks requested, verified in source, not tests)

| Rule checked | Source location | Result | Notes |
|---|---|---|---|
| Round-start tick removes expired conditions before decrementing survivors | src/combat/round.ts lines 39-60 | CORRECT | survivors = actor.conditions.filter(...) (drops roundsRemaining === 0, emits CONDITION_EXPIRED) runs first; ticked = survivors.map(...) (decrements by 1, emits CONDITION_TICKED) runs second. Matches design.md "remove, then decrement, then recharge" and the corrected combat-conditions spec. |
| A critical rolls the skill's own notation twice, summed (not one call with doubled notation) | src/combat/damage.ts rollDamage, lines 28-37 | CORRECT | first = random.rollDice(notation); total = critical ? first + random.rollDice(notation) : first -- two separate rollDice(notation) calls with the unchanged notation on a critical, matching R15 and the reconciled design D2. |
| BRACE's floor of 1 applies to the reduction, not the resulting damage | src/combat/damage.ts reduceDamage, lines 61-70 | CORRECT | reduction = Math.max(ctx.mitigation.minimum, modifier(...)); value = value - reduction -- the floor is applied to reduction before subtraction, never to value after. Matches the spec-wins fix documented in Engram #238 / commit cc8a80e. |
| POISONED subtracts 2 from the saving throw difficulty the bearer imposes, never from a save the bearer rolls | src/combat/magic-attack.ts saveDifficultyFor/resolveMagicAttack, lines 31-64 | CORRECT | saveDifficultyFor(attacker) reads only attacker.conditions and is the sole place the -2 is applied. resolveMagicAttack's defender-side total (kept + modifier(defender.constitution) + wardBonus) never reads any condition at all -- a POISONED defender's own save total is computed identically to an unpoisoned one. Confirmed structurally: no code path feeds defender.conditions into the -2. |
| A natural 20 hits and a natural 1 misses before armor class is consulted | src/combat/physical-attack.ts lines 41-42 | CORRECT | critical = kept === 20; hit = kept === 1 ? false : critical ? true : targetValue >= armorClass -- the ternary short-circuits both natural-1 (always false) and natural-20 (always true) before ever evaluating targetValue >= armorClass. |
| A fallen defender's COUNTER never fires | src/combat/turn.ts lines 226-313 | CORRECT | Step 6: if (defenderHpAfter <= 0) { defeatedId = defender.id; ... } else { /* step 7 counter-attack */ } -- the entire counter-attack block (including COUNTER's trigger check) lives exclusively inside the else branch, so a defeated defender's turn never reaches the counter logic at all. |

All six checks were verified by reading the source files directly, as requested (not the tests).

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| File layout matches design.md's File Layout table | Yes | All files present in src/combat/ map 1:1 to the table; index.ts is the only file touched by more than one slice, as designed. |
| RandomSource shape (D1) | Yes, with an approved deviation | rollD20: () => number / rollDice: (notation: string) => number as function-typed properties, not method signatures -- approved deviation (keeps expect(random.rollD20).toHaveBeenCalledTimes(n) lint-clean per @typescript-eslint/unbound-method). Behavior identical to design.md's interface. |
| Nine-step pipeline order (R11) | Yes | turn.ts implements defense modifiers -> action roll -> damage -> mitigation -> HP subtract -> death short-circuit -> counter-attack -> conditions -> two-row emission, in exactly that order, matching the design's sequence diagram and the spec's step numbering 1-9. |
| Damage reduction order (D4) | Yes | reduceDamage in damage.ts: WEAKENED -> save-passed -> PARRY -> BRACE -> clamp, matching D4's stated order exactly, including the BRACE-last / value > 0 guard rationale. |
| Reaction table split (D5) | Yes | reactions.ts REACTION_TABLE holds only behavior (answers/defense/mitigation/counter shape) not present as a Skill column; numeric data (1d6, 1d8, appliesCondition, conditionRounds) is read from the declared CombatSkill at composition time in turn.ts, never hardcoded by reaction code -- matches the split justification in design.md. |
| TurnRecord.skipped?: boolean (approved deviation) | Yes | Present in types.ts, used by turn.ts for both the STUNNED-actor short-circuit row and the STUNNED-defender-ignored reaction row; matches combat-conditions/spec.md's literal skipped: true wording. No prisma/schema.prisma change (verified: not touched by this change). |
| resolveMagicAttack's rawDamage field (approved deviation) | Yes | MagicAttackResult includes rawDamage, absent from design.md's illustrative signature; save-passed halving stays in reduceDamage, the single owner of that arithmetic, exactly as documented. |
| Slice 4 TDD process deviation (parts C, D, E first-write green) | Disclosed, not a defect | Confirmed against apply-progress (Engram #236) TDD Cycle Evidence table and the actual commit list (git log --oneline -- src/combat/): no commit exists for 4.6/4.8/4.10, matching the "NO SEPARATE COMMIT" notes in tasks.md. Process observation only, not reported as a finding. |

### TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Yes | Full "TDD Cycle Evidence" table present in Engram #236 (apply-progress) for slice 4; slices 1-3 report RED/GREEN status inline per task in tasks.md. |
| All tasks have tests | Yes | Every impl task in tasks.md is preceded by its test-writing task; verified by reading the full task list. |
| RED confirmed (tests exist) | Yes | All 12 *.spec.ts files exist in src/combat/, confirmed present via ls. |
| GREEN confirmed (tests pass) | Yes | pnpm test -- 139/139 passing, 15/15 suites, re-run in this verification session. |
| Triangulation adequate | Yes | Every requirement with more than one scenario has more than one distinct test case with different expected values (e.g. hit/miss/critical/nat-1 for physical attack; failed/passed/nat20/nat1/poisoned for magic attack). |
| Safety Net for modified files | N/A | This change only adds new files under src/combat/; no pre-existing source file was modified except docs/design/overview.md (docs) and openspec/changes/add-combat-engine/{tasks,design}.md (planning docs). |

**TDD Compliance**: 5/5 applicable checks passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 139 | 15 | Jest, jest.fn() mocks, no TestingModule |
| Integration | 0 | 0 | not applicable -- engine has no HTTP/WS surface in this phase |
| E2E | 0 | 0 | not applicable |
| Total | 139 | 15 | |

### Assertion Quality

Scanned all 13 *.spec.ts files under src/combat/ for banned patterns (tautologies, orphan
empty-collection checks without a companion, type-only-only assertions, ghost loops, smoke-test-
only renders, mock/assertion ratio). No violations found: every test in the suite asserts a
concrete computed value (hit/miss booleans, exact damage numbers, exact HP totals, exact event
shapes, or exact call counts/arguments tied to production code execution). No tautology-class
assertions, no empty-loop assertions, and no test that skips calling the module under test.

**Assertion quality**: All assertions verify real behavior -- 0 CRITICAL, 0 WARNING.

### Quality Metrics

**Linter**: No errors -- pnpm lint exit 0, zero --fix changes applied (confirmed via
git status --short immediately after).
**Type Checker**: No errors -- pnpm build (which runs nest build, a full tsc type-check via
Nest CLI) exits 0.

### Issues Found

**CRITICAL**:
1. combat-resolution scenario "Advantage can only raise the critical chance, never lower it" has
   no covering test anywhere in src/combat/*.spec.ts. Verified by grep for 'ADVANTAGE' bias
   combined with a natural-20 roll across the whole suite -- zero matches.
2. combat-conditions R17 scenario "A same-round reaction is unaffected by a condition just
   applied" has no covering test that exercises POISONED applied mid-round biasing (or failing to
   bias) that same bearer's own reaction later in the round. The property holds by source-code
   construction (no reaction ever rolls rollD20), but no runtime test proves it, and this phase's
   rule requires a passing runtime test for compliance.

**WARNING**:
1. Task-count drift across artifacts: Engram sdd/add-combat-engine/tasks (#235) states "45 tasks
   total," Engram sdd/add-combat-engine/apply-progress (#236) states "47/47 total tasks
   complete," but the authoritative openspec/changes/add-combat-engine/tasks.md file on disk
   contains exactly 42 checkbox items, all checked. Not a completion defect (0 unchecked boxes
   exist), but the narrative counts in two Engram memos do not match the file they describe.
2. tasks.md traceability claims for tasks 4.5/4.7 attribute test coverage to scenarios
   ("Advantage can only raise the critical chance...", "A same-round reaction is unaffected...")
   that the actually-written tests in those tasks' commits do not assert. See the two CRITICAL
   findings above for detail -- flagged again here as a process/documentation-accuracy issue
   distinct from the missing coverage itself.

**SUGGESTION**:
1. Given the mitigating source-code argument for the R17 same-round-reaction scenario (no reaction
   in REACTION_TABLE ever rolls rollD20, so attackBiasFor structurally cannot reach a reaction), a
   lightweight regression test asserting random.rollD20 is called at most once during any turn
   where a POISONED combatant both suffers a mid-round condition application and declares/uses a
   reaction would close this gap cheaply and make the guarantee explicit rather than implicit.
2. A direct physical-attack.spec.ts or turn.spec.ts case scripting rollD20 as [20, 5] under
   ADVANTAGE bias (e.g. via a combatant carrying a hypothetical advantage source, or by calling
   resolvePhysicalAttack directly with bias: 'ADVANTAGE') would close the first CRITICAL gap
   with a small, targeted addition -- no production code change is implied; only a test is missing.

### Verdict

**FAIL**

Two spec scenarios (of 53 total, across 21 requirements in 4 capability files) have no covering
runtime test: combat-resolution's "Advantage can only raise the critical chance, never lower it"
and combat-conditions's R17 "A same-round reaction is unaffected by a condition just applied."
All 139 existing tests pass, pnpm lint and pnpm build are both clean, all six hard invariants
requested for this verification hold by direct source inspection, and all 42 tasks on record in
tasks.md are checked and are backed by real commits (cross-checked against git log, including
all six merged PRs #15-#20). The implementation is otherwise faithful to spec, design, and the
four approved rule decisions checked (tick order, critical doubling, BRACE floor, POISONED
save-difficulty scoping, natural 20/1 pre-AC resolution, no-COUNTER-on-death). The two untested
scenarios are the sole blockers to archive.

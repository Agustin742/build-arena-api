# Tasks: Combat Engine (Phase 3)

Change: `add-combat-engine`. Inputs: `proposal.md`, `specs/*` (21 requirements, 53 scenarios
across 4 capability files), `design.md`, Engram 227/229/232/234 (settled, not reopened).
Strict TDD: every implementation task is preceded by the task that writes its failing test.

## Review Workload Forecast

| Slice | Branch | Code (est.) | Tests (est.) | Docs (est.) | Total | Fits 400? | Decision needed before apply |
|---|---|---|---|---|---|---|---|
| 1 | `feat/add-combat-engine` | ~130 | ~220 | 0 | ~350 | Yes | No |
| 2 | `feat/combat-attack-resolution` | ~150 | ~240 | ~10 | ~400 | Yes (at budget) | No |
| 3 | `feat/combat-conditions-reactions` | ~140 | ~240 | 0 | ~380 | Yes | No |
| 4 | `feat/combat-turn-pipeline` | ~110 | ~240 | 0 | ~350 | Yes | No |
| **Total** | | **~530** | **~940** | **~10** | **~1480** | — | — |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium (slice 2 lands exactly at the 400-line budget; if `magic-attack.spec.ts`
or the overview.md edit runs over its estimate, split slice 2 at the `physical-attack.ts`/
`magic-attack.ts` boundary — `damage.ts` + `physical-attack.ts` as PR 2a, `magic-attack.ts` +
overview.md edit as PR 2b. Not decided here; returned to the user if it happens.)

Delivery strategy: `ask-on-risk`. Each slice is independently landable and revertable per
`design.md` PR Slices table; no slice reopens a file an earlier slice shipped except `index.ts`.
Merge order to `main` is 1 → 2 → 3 → 4; each branch is cut from the previous one (stacked).

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Domain types, `RandomSource`, derived stats, advantage/disadvantage | PR 1 | `pnpm test src/combat` | N/A — pure engine, no HTTP/WS surface until Phase 5 | Revert PR 1 or delete `src/combat/{types,arithmetic,random-source,derived-stats,d20,index}.ts` |
| 2 | Physical/magic attack resolution, criticals, saves, overview.md §2.3 | PR 2 | `pnpm test src/combat` | N/A | Revert PR 2; `src/combat/{damage,physical-attack,magic-attack}.ts` and the overview.md paragraph |
| 3 | Conditions, refresh, round-start tick, reaction table | PR 3 | `pnpm test src/combat` | N/A | Revert PR 3; `src/combat/{conditions,reactions,round}.ts` |
| 4 | Nine-step pipeline composing action and reaction | PR 4 | `pnpm test src/combat` | N/A | Revert PR 4; `src/combat/turn.ts` |

---

## Slice 1 — `feat/add-combat-engine` (base: `main`, current branch)

- [ ] 1.1 Test: `src/combat/types.spec.ts` — guard spec, type-only import from
      `src/generated/prisma`, mutual assignability of `ConditionType`/`AttributeKey`/`SkillKind`.
      No spec.md scenario; required by design.md Testing Strategy "Contract" row.
      commit: `test(combat): add prisma enum assignability guard spec`
- [ ] 1.2 Impl: `src/combat/types.ts` — domain vocabulary (`Combatant`, `CombatSkill`,
      `ActiveConditionState`, `DeclaredAction/Reaction`, `TurnRecord`, `CombatEvent`,
      `TurnInput/Resolution`, `MitigationSpec`, `ReactionBehavior`). R: whole vocabulary; D1, D5.
      commit: `feat(combat): add combat domain types`
- [ ] 1.3 Test: `src/combat/arithmetic.spec.ts` — rounding at negative scores and odd values.
      No spec.md scenario; underlies R3, R5, R6, D3, D4.
      commit: `test(combat): cover arithmetic rounding invariants`
- [ ] 1.4 Impl: `src/combat/arithmetic.ts` — `modifier`, `halve`, `clampDamage`. D3.
      commit: `feat(combat): add rounding-safe arithmetic helpers`
- [ ] 1.5 Test: `src/combat/random-source.spec.ts` — notation parsing, per-die draw counts,
      `SequenceRandomSource` exhaustion. No spec.md scenario; D1, D8.
      commit: `test(combat): cover random source notation parsing and sequencing`
- [ ] 1.6 Impl: `src/combat/random-source.ts` — `RandomSource`, `SystemRandomSource`,
      `SequenceRandomSource`. D1, D8.
      commit: `feat(combat): add injectable random source with deterministic replay`
- [ ] 1.7 Test: `src/combat/derived-stats.spec.ts` — Requirement "Derived Stat Calculation":
      scenario "Armor class and max HP from frozen attributes"; plus initiative per requirement text.
      commit: `test(combat): cover derived stat formulas`
- [ ] 1.8 Impl: `src/combat/derived-stats.ts` — `armorClass`, `maxHp`, `initiative` (§4.1).
      commit: `feat(combat): compute derived stats from attributes`
- [ ] 1.9 Test: `src/combat/d20.spec.ts` — Requirement "Advantage and Disadvantage": scenarios
      "Advantage keeps the higher roll", "Disadvantage keeps the lower roll", "Advantage and
      disadvantage cancel". Decision D.
      commit: `test(combat): cover advantage disadvantage bias resolution`
- [ ] 1.10 Impl: `src/combat/d20.ts` — `resolveBias`, `rollD20With`. Decision D.
      commit: `feat(combat): add advantage and disadvantage bias resolution`
- [ ] 1.11 Impl: `src/combat/index.ts` — barrel export of slice-1 surface. No dedicated test:
      pure re-export, no behavior to fail against.
      commit: `feat(combat): export slice one public surface from index`
- [ ] 1.12 Verify: `pnpm test`, `pnpm lint`, `pnpm build` — gate before opening PR 1. No commit.

## Slice 2 — `feat/combat-attack-resolution` (base: `feat/add-combat-engine`)

- [ ] 2.1 Test: `src/combat/damage.spec.ts` — critical doubling (combat-resolution "Natural 20 is
      an automatic critical hit", R15/D2); WEAKENED halving (combat-conditions "A weakened
      attacker deals half damage", R3); save-passed halving (combat-resolution "Successful save
      halves damage, rounding down"); PARRY halving + WEAKENED+PARRY stacking (combat-reactions
      "PARRY mitigates a physical hit", "WEAKENED and PARRY apply as two independent halvings",
      R6); BRACE flat reduction + floor of 1 (combat-reactions "BRACE mitigates a hit", "BRACE
      never reduces by less than 1", R5); fixed reduction order (D4).
      commit: `test(combat): cover critical doubling and damage reduction order`
- [ ] 2.2 Impl: `src/combat/damage.ts` — `rollDamage` (two `rollDice` calls on crit), ordered
      `reduceDamage` chain (WEAKENED → save → PARRY → BRACE → clamp). R3, R5, R6, R15; D2, D4.
      commit: `feat(combat): add damage rolling and ordered reduction chain`
- [ ] 2.3 Test: `src/combat/physical-attack.spec.ts` — Requirement "Physical Attack Resolution":
      "Hit with POWER_STRIKE", "Miss with POWER_STRIKE", "Natural 20 is an automatic critical
      hit", "Natural 1 is an automatic miss" (R15, Decision E); Requirement "Resolving Attribute":
      "PRECISE_SHOT resolves with dexterity, not strength" (R14).
      commit: `test(combat): cover physical attack hit miss and critical resolution`
- [ ] 2.4 Impl: `src/combat/physical-attack.ts` — `d20 + mod(resolvingAttribute)` vs armor class,
      natural 20/1 short-circuit before AC lookup, R14 resolving attribute. R14, R15; Decision E.
      commit: `feat(combat): resolve physical attacks against armor class`
- [ ] 2.5 Test: `src/combat/magic-attack.spec.ts` — Requirement "Magic Attack Resolution": all six
      scenarios ("Failed save takes full damage", "Successful save halves damage, rounding down",
      "Natural 20 save is an ordinary success", "Natural 1 save is an ordinary failure", "A
      POISONED attacker's lowered difficulty turns a failed save into a successful one", "The
      POISONED penalty lowers the difficulty imposed, never a save the bearer makes"), R12/R13/
      Decision G; cross-ref combat-conditions "A poisoned magic attacker imposes a difficulty
      lowered by 2" (same assertion, primary home here per design.md).
      commit: `test(combat): cover magic saving throw and poisoned difficulty penalty`
- [ ] 2.6 Impl: `src/combat/magic-attack.ts` — `saveDifficultyFor` reading the attacker's
      conditions directly (no slice-3 import), `resolveMagicAttack`, no save critical. R12, R13;
      Decision G.
      commit: `feat(combat): resolve magic attacks via saving throw`
- [ ] 2.7 Docs: `docs/design/overview.md` §2.3 — add dexterity as a third offensive route (R14
      makes PRECISE_SHOT dexterity-resolved; §2.3 currently lists only strength and magic).
      commit: `docs(combat): document dexterity as third offensive route in overview`
- [ ] 2.8 Impl: `src/combat/index.ts` — extend with slice-2 surface. No dedicated test (barrel).
      commit: `feat(combat): export slice two public surface from index`
- [ ] 2.9 Verify: `pnpm test`, `pnpm lint`, `pnpm build` — gate before opening PR 2. No commit.

## Slice 3 — `feat/combat-conditions-reactions` (base: `feat/combat-attack-resolution`)

- [ ] 3.1 Test: `src/combat/conditions.spec.ts` — POISONED: "A poisoned attacker rolls with
      disadvantage" (composed with slice-1 `d20.ts` + slice-2 `physical-attack.ts`), "The -2
      never reaches a physical attack" (R1, Decision G; magic-difficulty math already owned by
      2.5); STUNNED: `isStunned` predicate (R2, Decision B — full skip-turn scenarios deferred to
      4.5); WEAKENED: `isWeakened` predicate (R3; arithmetic owned by 2.1); R16: "A near-expiring
      condition is refreshed, not stacked".
      commit: `test(combat): cover condition predicates and refresh on reapplication`
- [ ] 3.2 Impl: `src/combat/conditions.ts` — `attackBiasFor`, `isStunned`, `isWeakened`,
      `applyCondition` (refresh, not stack), failed-save condition helper. R1, R2, R3, R16;
      Decision B, Decision G.
      commit: `feat(combat): add condition predicates and refresh application`
- [ ] 3.3 Test: `src/combat/reactions.spec.ts` — Requirement "Reaction Applicability": "DODGE
      against a magic action does not apply" (R4), plus applicability assertions for BRACE/
      PARRY/ARCANE_WARD/COUNTER/RIPOSTE against both an applicable and a non-applicable action
      type (proposal Success Criteria), and `REACTION_TABLE` shape correctness for R5-R10.
      commit: `test(combat): cover reaction table applicability by action type`
- [ ] 3.4 Impl: `src/combat/reactions.ts` — `REACTION_TABLE`, `isApplicable`. R4-R10; Decision D5.
      commit: `feat(combat): add typed reaction table with applicability`
- [ ] 3.5 Test: `src/combat/round.spec.ts` — Requirement "Round Start": "The tick reaches the
      acting combatant's conditions only", "A duration counts the bearer's own turns" (Decision
      F); "An active condition ticks down"; "The acting combatant's reaction recharges" (Decision
      C). **Regression pin**: "A one-round condition still bites on the turn it was meant to
      cost" and "A condition expires at the following round start" — asserts remove-then-decrement
      order explicitly, since decrement-then-remove would expire STUNNED/1 before it bites and
      make MIND_SPIKE inert (Engram 232, Engram 234 contradiction #1).
      commit: `test(combat): pin remove-then-decrement round start tick order`
- [ ] 3.6 Impl: `src/combat/round.ts` — `startRound`: remove expired → decrement survivors →
      recharge reaction, scoped to the acting combatant only. Decision C, Decision F.
      commit: `feat(combat): add pure round start state transition`
- [ ] 3.7 Impl: `src/combat/index.ts` — extend with slice-3 surface. No dedicated test (barrel).
      commit: `feat(combat): export slice three public surface from index`
- [ ] 3.8 Verify: `pnpm test`, `pnpm lint`, `pnpm build` — gate before opening PR 3. No commit.

## Slice 4 — `feat/combat-turn-pipeline` (base: `feat/combat-conditions-reactions`)

- [ ] 4.1 Test: `src/combat/turn.spec.ts` (part A) — Requirement "Nine-Step Turn Resolution":
      "Step 1 — defense modifiers apply before the roll", "Step 2 — action roll uses the
      modified armor class", "Step 3 — damage calculated only after a confirmed hit", "Step 4 —
      mitigation applies to the calculated damage", "Step 5 — HP reduced by the mitigated value"
      (R11); combat-reactions "DODGE raises the effective armor class for one attack" (R7),
      "ARCANE_WARD raises the save total" (R8).
      commit: `test(combat): cover pipeline defense modifiers through hp subtraction`
- [ ] 4.2 Impl: `src/combat/turn.ts` (part A) — steps 1-5: defense modifier application, action
      roll, damage calc, mitigation, HP subtraction. R7, R8, R11 (steps 1-5).
      commit: `feat(combat): compose defense modifiers through hp subtraction`
- [ ] 4.3 Test: `src/combat/turn.spec.ts` (part B) — "Step 6 — death short-circuits before any
      counter-attack", "Step 7 — counter-attack resolves only after confirming survival", "Step
      8 — conditions applied after the counter-attack completes" (R11); combat-reactions
      "COUNTER returns damage after taking a hit", "POISONED does not alter a COUNTER
      counter-attack" (R1, R9), "RIPOSTE fires on a miss", "RIPOSTE does not trigger on a hit"
      (R10); combat-conditions "Failed save applies the condition", "Successful save does not
      apply the condition" (R13).
      commit: `test(combat): cover death short circuit counter attacks and condition application`
- [ ] 4.4 Impl: `src/combat/turn.ts` (part B) — steps 6-8: death short-circuit (no step 7/8 on
      defeat), COUNTER/RIPOSTE counter-attack, step-8 condition application gated by R13.
      R1, R9, R10, R11 (steps 6-8), R13.
      commit: `feat(combat): add death short circuit counter attacks and condition step`
- [ ] 4.5 Test: `src/combat/turn.spec.ts` (part C) — "Step 9 — exactly two turn results are
      always emitted" (R11); combat-conditions "A stunned actor's action is recorded as
      skipped, not empty", "A stunned defender cannot use a reaction" (R2, Decision B);
      combat-resolution "Advantage can only raise the critical chance, never lower it"
      (composition-level: bias + critical wiring).
      commit: `test(combat): cover two-row emission and stunned turn skipping`
- [ ] 4.6 Impl: `src/combat/turn.ts` (part C) — step 9 two-row emission, STUNNED skip path,
      advantage/critical wiring through the pipeline. R2, R11 (step 9); Decision B, Decision D.
      commit: `feat(combat): emit two turn rows and skip stunned turns`
- [ ] 4.7 Test: `src/combat/turn.spec.ts` (part D) — **step-8-terminal pin**: asserts no roll is
      made after step 8/condition application in `resolveTurn`, guarding the design-flagged risk
      that R17 currently holds only because nothing rolls after step 8 — a future phase inserting
      a post-condition roll would silently break it with no failing test today; combat-conditions
      "A same-round reaction is unaffected by a condition just applied" (R17); combat-turn-pipeline
      "RIPOSTE's WEAKENED does not rewrite the missed action it answered" (R10, R17, R11).
      commit: `test(combat): pin step eight as terminal to guard r17`
- [ ] 4.8 Impl: `src/combat/turn.ts` (part D) — satisfy the step-8-terminal pin; add an inline
      comment anchoring step 8 as the pipeline's terminal roll boundary for future phases. R17.
      commit: `feat(combat): anchor step eight as the pipeline's terminal roll boundary`
- [ ] 4.9 Test: `src/combat/turn.spec.ts` (part E) — determinism: two `SequenceRandomSource`
      instances over the same script produce deep-equal `resolveTurn` results (design.md Testing
      Strategy "Determinism" row).
      commit: `test(combat): cover deterministic replay with fixed random sequence`
- [ ] 4.10 Impl: `src/combat/turn.ts` (part E) — confirm `resolveTurn` purity (no shared mutable
      state across calls); supports proposal Success Criteria "identical inputs always produce
      identical turn results".
      commit: `feat(combat): guarantee resolveTurn purity for deterministic replay`
- [ ] 4.11 Impl: `src/combat/index.ts` — export `resolveTurn` as the final public entry point.
      No dedicated test (barrel).
      commit: `feat(combat): export resolve turn as the public engine entry point`
- [ ] 4.12 Verify: `pnpm test`, `pnpm lint`, `pnpm build` — gate before opening PR 4. No commit.

---

## Traceability Note

All 21 requirements and 53 scenarios across `combat-resolution` (16), `combat-conditions` (16),
`combat-reactions` (11), and `combat-turn-pipeline` (10) are covered by at least one task above.
Some scenarios are composition-level and traced to `turn.spec.ts` (slice 4) even though their
spec file is `combat-conditions` or `combat-reactions`, because their assertion needs the full
pipeline wired (e.g. DODGE/ARCANE_WARD/COUNTER/RIPOSTE numeric outcomes, STUNNED turn-skip,
advantage-raises-critical) — matching design.md's own module boundaries (`reduceDamage`'s
`MitigationSpec` math ships in slice 2; `reactions.ts` in slice 3 stays a pure table/applicability
reader with no pipeline in sight, per the PR Slices table).

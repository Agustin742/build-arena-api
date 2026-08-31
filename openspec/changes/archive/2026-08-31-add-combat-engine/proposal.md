# Proposal: Combat Engine (Phase 3)

## Intent

Build Arena is a duel game whose only real content is the fight. Today the fight does not
exist: the database can store a resolved turn, but nothing can decide what happened when a
player attacks. The design brief states the arithmetic (attack vs armor class, critical
doubling dice not the modifier, saving throw halving damage, advantage/disadvantage with
mutual cancellation) but leaves the game itself undefined — conditions have names and no
effect, reactions have costs and no behavior, and "resolve action and reaction together"
is not an order of operations. Those gaps are now closed by an approved ruleset. This
change turns that ruleset into a pure, deterministic engine so that the server — never the
client — is the sole authority over every roll, hit, and point of damage.

## Scope

### In Scope

- Pure TypeScript engine under `src/combat/`: no `@nestjs` import, no `@Injectable()`, no
  `combat.module.ts`. Consumed directly by `battle.service.ts` in Phase 5.
- `RandomSource` interface (`rollD20()`, `rollDice(notation)`) plus one real implementation.
  Fixing the source makes every resolution fully deterministic and unit-testable.
- Domain types: combatant, declared action, declared reaction, turn result, event,
  condition state.
- The approved ruleset, as requirements:

| # | Rule |
|---|------|
| R1 | `POISONED` (3 rounds) imposes disadvantage on the bearer's attack rolls |
| R2 | `STUNNED` (1 round) removes the bearer's action **and** reaction for that round |
| R3 | `WEAKENED` (2 rounds) halves damage dealt, rounding down |
| R4 | Reaction behavior lives in the engine as a typed table, never in the schema |
| R5 | `BRACE` (any) reduces damage by `modifier(constitution)`, minimum 1 |
| R6 | `PARRY` (physical) halves damage, rounding down |
| R7 | `DODGE` (physical) adds `modifier(dexterity)` to armor class for that attack only |
| R8 | `ARCANE_WARD` (magic) adds `modifier(magic)` to the saving throw |
| R9 | `COUNTER` (any) takes full damage, returns `1d6 + modifier(strength)` only if hit |
| R10 | `RIPOSTE` (physical) triggers only on a miss: `1d8 + modifier(dexterity)` and applies `WEAKENED` 2 rounds |
| R11 | Nine-step pipeline: defense modifiers → action roll → damage → mitigation → subtract HP → **stop if dead, no counter-attack** → counter-attack → apply conditions → emit two `BattleTurn` rows |
| R12 | No saving-throw critical. A natural 20 or 1 on a save does nothing special |
| R13 | A magic skill's condition lands **only on a failed save** |
| R14 | `PRECISE_SHOT` resolves with DEXTERITY: `d20 + modifier(dexterity)`, damage `1d6 + modifier(dexterity)` — the unlocking attribute is the resolving attribute |
| R15 | A critical rolls **twice as many dice** (`2d6` becomes `4d6`), not one roll doubled |
| R16 | Re-applying an active condition **refreshes** its duration |
| R17 | A condition applied mid-round has **no effect that round**; it governs from the next round start |

- Update `docs/design/overview.md` §2.3, which currently lists only strength and magic as
  offensive routes. R14 makes dexterity a third one. Recorded here; the edit belongs to
  this change.

### Out of Scope

- WebSocket gateway, reaction window, timers, or event emission over the wire — Phase 6.
- Build validation, attribute budget, kit budget, skill requirement checks — Phase 4. The
  engine consumes an already-valid combatant and an already-legal skill.
- Battle lifecycle, persistence, Prisma reads or writes, turn logging — Phase 5. The engine
  returns the two turn rows as data; it does not save them.
- Any `prisma/schema.prisma` change and any new migration. The schema already supports this
  ruleset.
- ELO, rating, matchmaking, HTTP routes, DTOs, Scalar annotations.
- Balancing the numbers. Values are the design's initial ones.

## Capabilities

### New Capabilities

- `combat-resolution`: derived stats, physical attack against armor class, magic attack via
  saving throw, criticals, damage calculation, advantage and disadvantage.
- `combat-conditions`: the three condition effects, application, refresh, round-start tick,
  expiration, and the mid-round deferral rule.
- `combat-reactions`: the typed reaction table, per-reaction applicability by action type,
  defense modifiers, mitigation, and counter-attacks.
- `combat-turn-pipeline`: the nine-step ordered resolution of an action together with a
  reaction, the death short-circuit, and the shape of the two emitted turn records.

### Modified Capabilities

- None. `openspec/specs/` is empty; this is the first capability set.

## Approach

Small single-purpose modules, each with a co-located `*.spec.ts`, composed by one entry
point. Randomness is injected through `RandomSource`, so a test forces a natural 20 by
mocking `rollD20` and an exact damage roll by mocking `rollDice`; advantage composes as two
`rollD20()` calls taking max or min, so the interface never learns that advantage exists,
and R15 is directly assertable by call count. Reaction behavior is a typed lookup keyed by
skill code — new reactions need new code regardless, so encoding them in the schema would
have bought a migration and no flexibility. Strict TDD: every resolution branch gets a
failing test first.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/combat/` | New | The whole engine plus co-located unit tests |
| `docs/design/overview.md` §2.3 | Modified | Add dexterity as a third offensive route (R14) |
| `prisma/schema.prisma` | Unchanged | No schema change, no migration |
| `src/auth/`, `src/common/` | Unchanged | No auth, guard, or rate-limiting impact |
| `src/app.module.ts` | Unchanged | Nothing to register; the engine is framework-free |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Pipeline ordering silently wrong (R11) — every outcome depends on it | Med | Spec the nine steps as ordered Given/When/Then scenarios; one test per step boundary, especially the death short-circuit before counter-attack |
| Rule interactions collide (critical with advantage, `WEAKENED` with `PARRY`, `POISONED` with a reaction roll) | Med | Explicit combination tests with a fixed die; document the raised critical rate under advantage |
| Size exceeds the 400-line review budget | High | Chained PRs — boundaries proposed below, decision returned to the user |
| R16 (refresh) is unobservable with the current catalog | Low | Accepted knowingly; every seeded skill applies a fixed duration, so refresh and max are indistinguishable today |
| `overview.md` §2.3 left stale | Low | The edit is in scope of this change, not deferred |

**Explicit non-risks per `openspec/config.yaml`**: this change does **not** touch
`prisma/schema.prisma`, does **not** create a migration, does **not** touch authentication,
guards, tokens, or rate limiting, and adds no network surface. Nothing imports the engine
until Phase 5, so a defect here cannot reach the running deployment.

## Rollback Plan

Additive: one new folder plus one documentation paragraph.

1. `git revert` the change commits, or delete `src/combat/` outright.
2. Revert the `docs/design/overview.md` §2.3 edit.

No database state, no migration to roll back, no runtime wiring to unpick — no module
registers the engine and no existing code imports it, so removal cannot break the build,
the API, or a deployed instance.

## Size Forecast

Measured against a 400 changed-line review budget, with strict TDD on.

| Part | Estimate |
|------|----------|
| Engine code (`src/combat/**`, ~10 files) | ~480–560 lines |
| Unit tests (co-located `*.spec.ts`) | ~800–1000 lines |
| `docs/design/overview.md` §2.3 edit | ~10 lines |
| **Total** | **~1300–1570 lines** |

**This is roughly 3–4× the budget.** Tests are the larger share by design: strict TDD plus
"cover every resolution branch" is the phase's own acceptance bar.

Suggested chained-PR boundaries, each independently testable and revertable — **proposed,
not decided; the split is the user's call**:

1. Domain types, `RandomSource`, derived stats, advantage/disadvantage (~350)
2. Physical attack with critical, magic attack with saving throw, R12, R14, R15, and the
   `overview.md` §2.3 edit (~400)
3. Conditions R1–R3, R13, R16, R17, and the reaction table R4–R10 with applicability (~380)
4. The nine-step pipeline R11 composing action and reaction, plus integration-level branch
   coverage (~350)

In a Feature Branch Chain, PR #1 targets `feat/add-combat-engine` and each later PR targets
the previous one.

## Dependencies

- None blocking. Attribute (20) and kit (18) budgets remain undecided and are Phase 4 scope;
  the engine never validates a budget.
- Downstream: Phase 5 (`battle.service.ts`) and Phase 6 (WebSocket gateway) consume this
  engine.

## Success Criteria

- [ ] `src/combat/` imports nothing from `@nestjs`; no `@Injectable()`, no `combat.module.ts`.
- [ ] With a fixed `RandomSource`, identical inputs always produce identical turn results.
- [ ] All seventeen rules above are covered by unit tests, including hit, miss, critical,
      save passed, save failed, condition applied, condition expired, and advantage
      cancellation.
- [ ] Every reaction has a test for both its applicable and non-applicable action type.
- [ ] The death short-circuit is tested: a combatant reduced to 0 HP produces no
      counter-attack.
- [ ] `pnpm test`, `pnpm lint`, and `pnpm build` pass.
- [ ] `docs/design/overview.md` §2.3 lists dexterity as an offensive route.

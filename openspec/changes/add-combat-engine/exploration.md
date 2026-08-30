# Exploration — Combat engine (Phase 3, `add-combat-engine`)

Investigation only. No implementation, no requirements decided here.

Sources read: `docs/brief/proyecto-4-integrartec-2026.md`, `docs/design/overview.md`,
`docs/design/architecture.md`, `docs/design/implementation-plan.md`,
`prisma/schema.prisma`, `prisma/seed.ts`, `openspec/config.yaml`, and the existing
`src/auth`, `src/prisma`, `src/health` modules.

## 1. Current state

`src/combat/` does not exist yet. This phase is greenfield.

`architecture.md` already designates `combat/` as the framework-free exception: it
exports no Nest module because it does not depend on the framework. The location is
therefore a decision already made, not an open question.

Existing conventions the engine should match:

- `*.spec.ts` co-located next to the file under test.
- Plain `jest.fn()` mocks; no `@nestjs/testing` `TestingModule` anywhere in the repo.
- No repository layer over Prisma, and no base classes — `architecture.md` rejects a
  generic `BaseService<T>` explicitly.

## 2. Rules the assignment states explicitly

These are quoted from `docs/design/overview.md` and are NOT open questions.

**Derived stats (§4.1)**

```
armorClass = 10 + modifier(dexterity)
maxHp      = 30 + modifier(constitution) * 5
initiative = d20 + modifier(dexterity)
```

**Physical attack (§4.2)** — `d20 + modifier(strength)` against `armorClass`. Meeting or
exceeding the armor class hits. Binary: there is no partial damage. A natural 20 is a
critical and doubles the damage dice, not the modifier.

```
damage           = skillDice + modifier(strength)
damage(critical) = skillDice * 2 + modifier(strength)
```

**Magic attack (§4.3)** — no attack roll against armor class. The attacker sets
`saveDifficulty = 8 + modifier(magic)`; the defender rolls `d20 + modifier(constitution)`
against it. Success halves the damage, failure takes it in full.

**Advantage and disadvantage (§4.4)** — roll 2d20 and keep the high or the low one. They
do not stack: two sources of advantage are still advantage, and advantage with
disadvantage cancel into a clean single roll.

**Conditions (§4.5)** — a state that persists across rounds and modifies future rolls,
with a duration counted in rounds. The set is `POISONED`, `STUNNED`, `WEAKENED`. No
mechanical effect is defined beyond that sentence.

**Round anatomy (§4.6)** — at round start the acting player's reaction recharges and
active condition durations tick down. The actor declares an action. If the rival has an
available AND applicable reaction, a reaction window of roughly five seconds opens. The
engine then resolves action and reaction together. The turn is persisted and emitted. The
battle ends at 0 HP; otherwise the turn passes.

**Bounded accuracy (§4.7)** — modifiers stay small so the d20 keeps deciding outcomes.

## 3. What the schema already provides

| Model | Relevant fields | Note |
| --- | --- | --- |
| `Skill` | `cost`, `requiredAttribute`, `requiredValue`, `damageDice`, `appliesCondition`, `conditionRounds` | Catalog data only. No field describes reaction behavior. |
| `BattleCombatant` | frozen `strength`, `magic`, `dexterity`, `constitution`, `armorClass`, `maxHp`, `currentHp`, `initiative`, `reactionAvailable` | Stats are frozen when the battle is accepted. |
| `ActiveCondition` | `type`, `roundsRemaining`, `@@unique([combatantId, type])` | The unique constraint structurally caps same-type conditions at one row. |
| `BattleTurn` | `round`, `sequence`, `kind`, `skillCode`, `attackRoll`, `targetValue`, `hit`, `critical`, `damage`, `@@unique([battleId, round, sequence])` | The composite unique key implies action and reaction are logged as two rows in the same round, not one merged row. |

State that exists only in memory during a turn, and therefore belongs to this phase's
domain types rather than to the schema: the paired action-and-reaction declaration being
resolved together, the raw intermediate d20 values when advantage or disadvantage rolls
two dice (the schema stores only the kept value, but the WebSocket design surfaces rolls
in the plural to clients), whether a reaction is applicable to the incoming action, and
the resolution order itself — `sequence` is a log position, not a resolution instruction.

## 4. Gaps — nothing in the repository defines these

Verified by full reads of the brief, the design documents, the schema, and the seed. These
are gaps, not rules with an obvious default.

1. **Condition mechanics are entirely undefined.** `POISONED`, `STUNNED` and `WEAKENED`
   have a name and a duration. "Modifies future rolls" is the only behavioral hint, and it
   is stated once for all three uniformly. This blocks the condition scope of this phase
   directly, and it is the largest gap found.
2. **Reaction mechanics are entirely undefined.** The `Skill` model has no field
   describing what a reaction does. Nothing quantifies the mitigation of `BRACE` or
   `PARRY`, the avoidance mechanism of `DODGE`, the strength of `ARCANE_WARD`, or the
   trigger of `COUNTER` and `RIPOSTE`.
3. **The reaction applicability rule is undefined.** §4.6 opens a window only when a
   reaction is applicable, which implies some reactions answer only some action types. No
   rule states which.
4. **Action-and-reaction resolution order is undefined.** §4.6 says the engine resolves
   them together. That is not an algorithm. Whether a reaction's effect applies before or
   after the action's roll is evaluated changes every outcome.
5. **Saving-throw criticals are undefined.** Nothing states what a natural 20 or a natural
   1 on the defender's save does beyond the ordinary half-or-full damage rule.
6. **Condition trigger on magic skills is ambiguous.** `VENOM_BOLT` and `MIND_SPIKE` apply
   a condition on a magic hit, but it is unstated whether the condition lands only on a
   failed save or always, even when the save succeeds and the damage is halved.
7. **Same-type re-application policy is unstated.** The schema proves it cannot be two
   stacked instances. Refresh the duration, keep the maximum, or ignore the new
   application — undecided.
8. **In-round effect of a condition applied mid-round is unstated.** Durations tick down
   at round start, before resolution, so a condition applied mid-round starts counting at
   the next round start. Whether it also modifies rolls later in the same round — the
   reaction's own counter-roll, for instance — is open.
9. **Unlock attribute and resolution attribute are conflated.** §2.3 wires exactly two
   offensive routes: strength drives physical attacks against armor class, magic drives
   saving-throw attacks. Dexterity's only listed roles are defensive. Yet the seeded
   `PRECISE_SHOT` is a physical action requiring DEXTERITY 13. Nothing states which
   attribute resolves its roll.
10. **"Double the dice" is ambiguous at roll level.** `skillDice * 2` can mean rolling
    twice as many dice, or rolling once and doubling the sum. The two have different
    variance and different numbers of calls into the random source, which matters for
    deterministic tests.

## 5. Rule interactions examined

- **Critical doubles dice, not the modifier** — explicitly stated. Not a gap.
- **Advantage combined with a critical** — no special rule is needed. Rolling 2d20, keeping
  the highest, then checking whether the kept value is 20 naturally raises the critical
  rate from 5% to roughly 9.75%. The design never draws this connection, so it is worth
  recording as a documented consequence rather than leaving it implicit.
- **A reaction that changes armor class or applies a condition mid-resolution** —
  unresolved. See gap 4. This is the central ordering problem of the phase.
- **A critical on a saving throw** — unresolved. See gap 5.
- **A condition applied this turn taking effect this turn** — partially disambiguated for
  duration counting by the round-start tick, but the in-round effect stays open. See gap 8.

## 6. Seeded skills and what each demands from the engine

| Code | Type | Required | Dice | Condition | Engine support needed | Open mechanic |
| --- | --- | --- | --- | --- | --- | --- |
| `POWER_STRIKE` | ACTION | STR 12 | 1d8 | — | physical attack, critical doubling | none, canonical case |
| `RECKLESS_BLOW` | ACTION | STR 14 | 2d6 | — | multi-die damage notation | dice-doubling reading (gap 10) |
| `PRECISE_SHOT` | ACTION | DEX 13 | 1d6 | — | physical attack gated by DEX | resolution attribute (gap 9) |
| `FIREBALL` | ACTION | MAG 12 | 2d6 | — | magic attack and save, half on success | none, canonical case |
| `VENOM_BOLT` | ACTION | MAG 11 | 1d4 | POISONED / 3 | magic attack plus condition | POISONED effect (gap 1), trigger (gap 6) |
| `MIND_SPIKE` | ACTION | MAG 14 | 1d10 | STUNNED / 1 | magic attack plus condition | STUNNED effect (gap 1), trigger (gap 6) |
| `BRACE` | REACTION | CON 12 | — | — | damage mitigation, no roll implied | reduction formula (gap 2) |
| `PARRY` | REACTION | STR 12 | — | — | partial damage reduction | reduction formula (gap 2) |
| `DODGE` | REACTION | DEX 12 | — | — | avoidance, hit converted to miss? | mechanism (gap 2), applicability (gap 3) |
| `ARCANE_WARD` | REACTION | MAG 12 | — | — | ward, possibly magic-only | strength and scope (gaps 2, 3) |
| `COUNTER` | REACTION | STR 14 | 1d6 | — | take the hit and deal counter damage | trigger, own attack roll? (gap 2) |
| `RIPOSTE` | REACTION | DEX 14 | 1d8 | WEAKENED / 2 | avoid, counter-attack, apply condition | compounds gaps 1 and 2 |

## 7. Where the engine lives

`src/combat/`, as already designated by `architecture.md`. Plain TypeScript files: no
`@Injectable()`, no `combat.module.ts`. There is nothing to register with the Nest
container — the engine is consumed directly by whichever service calls it, which will be
`battle.service.ts` in Phase 5.

Suggested split, matching the round-anatomy vocabulary the design already uses: domain
types (combatant, declared action, reaction, turn result, event), the `RandomSource`
interface plus a real implementation, one module per resolution rule (physical attack,
magic attack, advantage, conditions), and one entry point composing action and reaction.
Each file paired with a co-located `*.spec.ts`.

## 8. Injected randomness — options compared

| Option | Shape | Trade-off |
| --- | --- | --- |
| Seeded PRNG | inject a numeric seed, deterministic algorithm | Fully deterministic, but forcing a natural 20 means reverse-engineering which seed produces one, or hardcoding the algorithm's internals into the test. That is exactly the opaque coupling determinism is supposed to remove. |
| Bare `() => number` | one function for every roll | Minimal surface, but it cannot distinguish an attack roll from a damage roll, and it handles `2d6` awkwardly. |
| **`RandomSource` interface** with `rollD20(): number` and `rollDice(notation: string): number` | one method per roll kind the rules actually use | Recommended. Maps one-to-one onto the two roll kinds in the rules. A test forces a natural 20 by mocking `rollD20`, and a specific damage roll by mocking `rollDice`. Advantage composes as two `rollD20()` calls with max or min, so the interface never needs to know advantage exists. |

Recommendation: the `RandomSource` interface. It is the only option that lets a test force
a natural 20, a natural 1, and an exact damage roll directly and readably.

## 9. Attribute budget and kit budget — dependency check

The proposed totals (20 attribute points, 18 kit points) appear in no document and in no
prior decision. Only the escalating-cost table structure and the separation of the two
budgets are decided.

**Phase 3 does not depend on them.** The engine resolves rolls from an already-valid
combatant and an already-legal declared skill; it never checks whether a build fits a
budget. That validation is explicit Phase 4 scope. Unit tests here construct combatants
with arbitrary attribute values directly. The risk is deferred, not blocking.

## 10. Open questions, ordered by design impact

1. What does each of `POISONED`, `STUNNED` and `WEAKENED` mechanically do?
2. What does each reaction skill do, and which action types can each answer?
3. Does a reaction's effect apply before or after the action's roll is evaluated?
4. Does a natural 20 or 1 on a saving throw do anything beyond half or full damage?
5. Does an applied condition land only on a failed save, or always on a hit?
6. Which attribute resolves a physical skill's roll when its gate is DEXTERITY?
7. Does doubling the dice mean more dice, or one roll with a doubled sum?
8. What happens when an already-active condition of the same type is re-applied?
9. Does a condition applied mid-round affect later rolls in that same round?

## 11. Readiness

**Not ready for the proposal.** Questions 1 through 3 are load-bearing for the domain types
and for the resolution algorithm. Writing the specification before they are answered would
encode invented game rules as if the assignment had given them.

# Combat Turn Pipeline Specification

## Purpose

Defines the nine-step deterministic order in which the engine resolves a
declared action together with an optional declared reaction, including the
death short-circuit and the shape of the two emitted turn results.

## Requirements

### Requirement: Nine-Step Turn Resolution Order (R11)

The engine MUST resolve an action and its optional reaction in exactly this
order: (1) defense modifiers — DODGE, ARCANE_WARD — before the roll, (2) the
action roll, (3) damage calculation, (4) mitigation — BRACE, PARRY — (5)
subtract HP, (6) stop with no counter-attack if the defender is at 0 HP, (7)
counter-attack — COUNTER, RIPOSTE — (8) apply conditions, (9) emit two
BattleTurn-shaped results.

#### Scenario: Step 1 — defense modifiers apply before the roll

- GIVEN defender base armorClass 12, dexterity mod +2, DODGE declared against a physical action
- WHEN the attacker's roll is evaluated
- THEN it is compared against effective armorClass 14, already including DODGE

#### Scenario: Step 2 — the action roll uses the modified armor class

- GIVEN effective armorClass 14 from step 1, attacker strength mod +1
- WHEN rollD20() returns 13 (14 total)
- THEN the attack hits, meeting armorClass exactly

#### Scenario: Step 3 — damage is calculated only after a confirmed hit

- WHEN the action roll from step 2 misses instead
- THEN damage calculation yields 0 and rollDice() is never called

#### Scenario: Step 4 — mitigation applies to the calculated damage

- GIVEN raw damage 8 from step 3, defender constitution mod +2, BRACE declared
- WHEN mitigation is applied
- THEN the mitigated damage is 6

#### Scenario: Step 5 — HP is reduced by the mitigated value

- GIVEN mitigated damage 6 from step 4, defender currentHp 10
- WHEN HP is subtracted
- THEN currentHp becomes 4

#### Scenario: Step 6 — death short-circuits before any counter-attack

- GIVEN defender currentHp reaches exactly 0 after step 5, and the defender had declared COUNTER and was hit
- WHEN resolution continues
- THEN no counter-attack is resolved, and COUNTER's turn result records no roll and no damage

#### Scenario: Step 7 — counter-attack resolves only after confirming survival

- GIVEN defender currentHp is 1 (not 0) after step 5, COUNTER declared and the action hit
- WHEN resolution continues
- THEN rollDice('1d6') is called and its result plus mod(strength) is returned as damage to the attacker

#### Scenario: Step 8 — conditions are applied after the counter-attack completes

- GIVEN RIPOSTE triggers in step 7 on a missed action and returns counter damage
- WHEN step 8 executes
- THEN WEAKENED (2 rounds) is applied to the original attacker only after the counter damage value from step 7 is already finalized

#### Scenario: Step 9 — exactly two turn results are always emitted

- GIVEN a round with one action and no reaction declared or available
- WHEN resolution completes
- THEN two results are emitted: one `kind: ACTION` with the resolved data, and one `kind: REACTION` with all rollable fields null

### Requirement: A Reaction's Applied Condition Does Not Retroactively Affect the Already-Resolved Action (R10, R17, R11)

Because conditions are applied at step 8, after damage and HP were already
resolved at steps 3-5, a condition a reaction applies to the original
attacker MUST NOT change the damage or hit result already recorded for that
same round's action.

#### Scenario: RIPOSTE's WEAKENED does not rewrite the missed action it answered

- GIVEN the attacker's action missed in step 2 (0 damage recorded)
- WHEN RIPOSTE fires in step 7 and applies WEAKENED to the attacker in step 8
- THEN the action's already-recorded result stays a miss with 0 damage, and WEAKENED only affects the attacker's next action, per R17

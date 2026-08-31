# Combat Reactions Specification

## Purpose

Defines the typed reaction table living in the engine — never the schema —
each reaction's mechanical effect, which action types it may answer, and its
interaction with active conditions.

## Requirements

### Requirement: Reaction Applicability by Action Type (R4)

The engine MUST restrict each reaction to the action types it can answer:
PARRY, DODGE, and RIPOSTE answer only physical actions; ARCANE_WARD answers
only magic actions; BRACE and COUNTER answer either. A reaction declared
against an inapplicable action type MUST NOT be applied.

#### Scenario: DODGE against a magic action does not apply

- GIVEN the defender declares DODGE and the incoming action is magic
- WHEN the action resolves
- THEN DODGE's armor class bonus MUST NOT be applied

### Requirement: BRACE Reduces Damage by Constitution Modifier, Minimum 1 (R5)

BRACE MUST reduce the already-calculated damage by `mod(constitution)`, with
a floor of 1 point of reduction, and applies to any action type.

#### Scenario: BRACE mitigates a hit

- GIVEN defender constitution mod +2, raw damage 7
- WHEN BRACE is used
- THEN mitigated damage is 5

#### Scenario: BRACE never reduces by less than 1

- GIVEN defender constitution mod -1, raw damage 4
- WHEN BRACE is used
- THEN mitigated damage is 3, reduced by the floor of 1, not increased

### Requirement: PARRY Halves Physical Damage, Rounding Down (R6)

PARRY MUST halve the already-calculated damage of a physical action,
rounding down, and applies only to physical actions.

#### Scenario: PARRY mitigates a physical hit

- GIVEN raw damage 9
- WHEN PARRY is used
- THEN mitigated damage is floor(9 / 2) = 4

#### Scenario: WEAKENED and PARRY apply as two independent halvings

- GIVEN the attacker is WEAKENED and raw damage is 11
- WHEN WEAKENED halves it to floor(11 / 2) = 5, then the defender's PARRY halves that result
- THEN mitigated damage is floor(5 / 2) = 2, computed as two sequential halving steps, not a single combined division

### Requirement: DODGE Adds Dexterity Modifier to Armor Class for One Attack (R7)

DODGE MUST add `mod(dexterity)` to the defender's armor class for that
single incoming physical attack only, applied before the attack roll is
evaluated.

#### Scenario: DODGE raises the effective armor class for one attack

- GIVEN base armorClass 12, defender dexterity mod +2
- WHEN DODGE is used against an incoming physical attack
- THEN the effective armor class for that attack is 14

### Requirement: ARCANE_WARD Adds Magic Modifier to the Saving Throw (R8)

ARCANE_WARD MUST add `mod(magic)` to the defender's saving throw for that
single incoming magic attack only, and applies only to magic actions. The
bonus MUST land on the defender's roll and never on the difficulty, which is
computed from the attacker's magic and conditions (Decision G); the two are
independent and compose without interfering.

#### Scenario: ARCANE_WARD raises the save total

- GIVEN defender constitution mod +1, magic mod +2, and an unpoisoned attacker with magic mod +2 (saveDifficulty 10)
- WHEN rollD20() returns 6 (7 total without the ward) and ARCANE_WARD is used
- THEN the total is 9, still failing against 10 in this example, showing the modifier is additive, not a guaranteed success

### Requirement: COUNTER Takes Full Damage and Returns a Counter-Attack on a Hit (R9)

COUNTER MUST NOT mitigate the incoming damage. If the incoming action hit,
COUNTER MUST return `rollDice('1d6') + mod(strength)` damage to the original
attacker. COUNTER never makes its own `rollD20()` attack roll; it triggers
automatically from the incoming action's hit result.

#### Scenario: COUNTER returns damage after taking a hit

- GIVEN defender strength mod +2, the incoming action hit
- WHEN rollDice('1d6') returns 4
- THEN the defender takes the full incoming damage and returns 6 damage to the attacker

#### Scenario: POISONED does not alter a COUNTER counter-attack

- GIVEN the defender using COUNTER is POISONED
- WHEN the counter-attack resolves
- THEN no additional rollD20() calls occur for the counter-attack and its damage is unaffected, because POISONED's disadvantage applies only to attack rolls and COUNTER has none, and its -2 applies only to the saving throw difficulty of a magic attack, which a counter-attack never imposes

### Requirement: RIPOSTE Triggers Only on a Miss and Applies WEAKENED (R10)

RIPOSTE MUST trigger only when the incoming physical action misses. On
trigger, it MUST return `rollDice('1d8') + mod(dexterity)` damage to the
original attacker and apply WEAKENED with roundsRemaining 2 to that
attacker.

#### Scenario: RIPOSTE fires on a miss

- GIVEN defender dexterity mod +1, the incoming physical action missed
- WHEN rollDice('1d8') returns 5
- THEN the defender returns 6 damage and WEAKENED (2 rounds) is applied to the original attacker

#### Scenario: RIPOSTE does not trigger on a hit

- GIVEN the incoming physical action hit
- WHEN the defender had declared RIPOSTE
- THEN no counter-attack damage is returned and WEAKENED is not applied

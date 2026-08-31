# Combat Resolution Specification

## Purpose

Defines how the engine computes derived stats and resolves a single physical
or magic action: attack roll versus armor class, saving throw versus a save
difficulty, critical hits, and advantage/disadvantage. All outcomes derive
from `RandomSource.rollD20()` and `RandomSource.rollDice(notation)`, so every
scenario is reproducible with a fixed source.

## Requirements

### Requirement: Derived Stat Calculation (Baseline, overview.md §4.1)

The engine MUST compute `armorClass = 10 + mod(dexterity)`,
`maxHp = 30 + mod(constitution) * 5`, and
`initiative = rollD20() + mod(dexterity)`, where
`mod(value) = floor((value - 10) / 2)`.

#### Scenario: Armor class and max HP from frozen attributes

- GIVEN a combatant with dexterity 14 (mod +2) and constitution 12 (mod +1)
- WHEN derived stats are computed
- THEN armorClass is 12 and maxHp is 35

### Requirement: Physical Attack Resolution Against Armor Class (Baseline §4.2, R15, Decision E)

The engine MUST roll `rollD20() + mod(strength)` against the defender's
effective armor class. Meeting or exceeding it is a hit; there is no partial
damage. A natural 20 is always a hit and a critical, doubling the number of
damage dice rolled — R15 means two separate `rollDice(notation)` calls with
the skill's damage notation, summed, not one call with a doubled notation. A
natural 1 is always a miss, regardless of the total (Decision E). Both
outcomes MUST be decided before the effective armor class is consulted, so
DODGE's bonus can never negate a critical and can never rescue a natural 1.

#### Scenario: Hit with POWER_STRIKE

- GIVEN attacker strength mod +2, defender armorClass 14
- WHEN rollD20() returns 15 (17 total) and rollDice('1d8') returns 5
- THEN the attack hits and damage is 7

#### Scenario: Miss with POWER_STRIKE

- GIVEN attacker strength mod +2, defender armorClass 14
- WHEN rollD20() returns 8 (10 total)
- THEN the attack misses, damage is 0, and rollDice is not called

#### Scenario: Natural 20 is an automatic critical hit

- GIVEN attacker strength mod +2, defender armorClass 18 (roll+mod would otherwise miss)
- WHEN rollD20() returns 20 and rollDice('1d8') is called twice, returning 5 then 3
- THEN the attack hits, is marked critical, and damage is 5 + 3 + 2 = 10

#### Scenario: Natural 1 is an automatic miss

- GIVEN attacker strength mod +5, defender armorClass 6 (roll+mod would otherwise hit)
- WHEN rollD20() returns 1 (6 total, which meets armorClass 6)
- THEN the attack misses, damage is 0, rollDice is not called, and RIPOSTE's miss trigger is open

### Requirement: Magic Attack Resolution via Saving Throw (Baseline §4.3, R12, R13, Decision G)

The engine MUST compute the save difficulty from the **attacker's** magic
score and the **attacker's** active conditions:
`saveDifficulty = 8 + mod(attacker.magic)`, lowered by 2 while the attacker
is POISONED, giving `saveDifficulty = 8 + mod(attacker.magic) - 2` in that
case (Decision G). Reading the attacker's conditions here is mandatory: it is
the only step of the resolution that consults the attacker's conditions
rather than the defender's. The engine MUST then roll the defender's save as
`rollD20() + mod(constitution)`. A successful save halves damage, rounding
down; a failed save takes it in full. A natural 20 or natural 1 on the save
MUST NOT trigger any special effect beyond the ordinary success/failure
outcome (R12).

#### Scenario: Failed save takes full damage

- GIVEN FIREBALL, attacker magic mod +2 with no active conditions (saveDifficulty 10), defender constitution mod +1
- WHEN defender rollD20() returns 8 (9 total, fails) and rollDice('2d6') returns 9
- THEN damage is 9

#### Scenario: Successful save halves damage, rounding down

- GIVEN the same FIREBALL setup
- WHEN defender rollD20() returns 15 (16 total, succeeds) and rollDice('2d6') returns 9
- THEN damage is floor(9 / 2) = 4

#### Scenario: Natural 20 save is an ordinary success, not a special negation

- GIVEN the same FIREBALL setup
- WHEN defender rollD20() returns 20 (succeeds) and rollDice('2d6') returns 9
- THEN damage is 4, identical to any other successful save, with no additional effect

#### Scenario: Natural 1 save is an ordinary failure, not a special critical failure

- GIVEN the same FIREBALL setup
- WHEN defender rollD20() returns 1 (fails) and rollDice('2d6') returns 9
- THEN damage is 9, identical to any other failed save, with no additional effect

#### Scenario: A POISONED attacker's lowered difficulty turns a failed save into a successful one

- GIVEN FIREBALL, attacker magic mod +2 and POISONED with roundsRemaining 2, so saveDifficulty is 8 + 2 - 2 = 8, defender constitution mod +1
- WHEN defender rollD20() returns 8 (9 total) and rollDice('2d6') returns 9
- THEN the save succeeds against 8 and damage is floor(9 / 2) = 4, where the identical roll against the unpoisoned difficulty of 10 would have failed and dealt 9

#### Scenario: The POISONED penalty lowers the difficulty imposed, never a save the bearer makes

- GIVEN the POISONED combatant is the defender against FIREBALL from an unpoisoned attacker with magic mod +2 (saveDifficulty 10), defender constitution mod +1
- WHEN defender rollD20() returns 8 (9 total)
- THEN the save fails against 10, because POISONED lowers only the difficulty its bearer imposes when attacking with magic and never the bearer's own save total

### Requirement: Advantage and Disadvantage (Baseline §4.4, Decision D)

Advantage MUST roll `rollD20()` twice and keep the higher value; disadvantage
MUST roll it twice and keep the lower. They MUST NOT stack, and simultaneous
advantage and disadvantage MUST cancel into a single ordinary `rollD20()`
call. Because a natural 20 is a critical, keeping the higher of two d20s
under advantage raises the observed critical rate from 5% to
`1 - (19/20)^2 ≈ 9.75%`. This is an intended mathematical consequence of R15
combined with advantage, not a defect, and the specification MUST document
it as such.

#### Scenario: Advantage keeps the higher roll

- WHEN rollD20() is called twice, returning 7 then 15
- THEN the kept value is 15

#### Scenario: Disadvantage keeps the lower roll

- WHEN rollD20() is called twice, returning 7 then 15
- THEN the kept value is 7

#### Scenario: Advantage and disadvantage cancel

- GIVEN a combatant with both an advantage source and a disadvantage source active
- WHEN the roll resolves
- THEN rollD20() is called exactly once and its value is used directly

#### Scenario: Advantage can only raise the critical chance, never lower it

- GIVEN advantage is active
- WHEN rollD20() is called twice, returning 20 then 5
- THEN the kept value is 20 and the attack is treated as a critical, confirming the raised critical rate is the intended behavior

### Requirement: Resolving Attribute for a Physical Skill Gated by a Different Attribute (R14)

When a skill's `requiredAttribute` differs from the attribute the assignment
lists as an offensive route, the engine MUST resolve the attack roll and
damage with the attribute that gates (unlocks) the skill, not with strength.
PRECISE_SHOT, gated by DEXTERITY, MUST use `mod(dexterity)` for both its
attack roll and its damage roll.

#### Scenario: PRECISE_SHOT resolves with dexterity, not strength

- GIVEN attacker dexterity mod +1, strength mod +4, defender armorClass 12
- WHEN rollD20() returns 12 (13 total) and rollDice('1d6') returns 4
- THEN the attack hits with target value 13 (using +1, not +4) and damage is 5

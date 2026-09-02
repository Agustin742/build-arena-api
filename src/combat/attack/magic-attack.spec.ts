import { reduceDamage } from './damage';
import { resolveMagicAttack, saveDifficultyFor } from './magic-attack';
import type { RandomSource } from '../core/random-source';
import type { Combatant, CombatSkill } from '../types';

const buildCombatant = (overrides: Partial<Combatant> = {}): Combatant => ({
  id: 'combatant-1',
  userId: 'user-1',
  strength: 10,
  magic: 10,
  dexterity: 10,
  constitution: 10,
  armorClass: 10,
  maxHp: 30,
  currentHp: 30,
  initiative: 0,
  reactionAvailable: true,
  conditions: [],
  ...overrides,
});

const fireball: CombatSkill = {
  code: 'FIREBALL',
  type: 'ACTION',
  requiredAttribute: 'MAGIC',
  damageDice: '1d12',
  appliesCondition: null,
  conditionRounds: null,
};

describe('saveDifficultyFor', () => {
  it('is 8 + mod(magic) with no active conditions', () => {
    const attacker = buildCombatant({ magic: 14 }); // mod +2

    expect(saveDifficultyFor(attacker)).toBe(10);
  });

  it('is lowered by 2 while the attacker is POISONED (Decision G)', () => {
    const attacker = buildCombatant({
      magic: 14, // mod +2
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }],
    });

    expect(saveDifficultyFor(attacker)).toBe(8);
  });
});

describe('resolveMagicAttack', () => {
  it('fails a save that falls short and takes full damage on the failed save', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(8),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // mod +2, saveDifficulty 10
    const defender = buildCombatant({ constitution: 12 }); // mod +1

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    expect(result.difficulty).toBe(10);
    expect(result.kept).toBe(8);
    expect(result.savePassed).toBe(false);
    expect(result.rawDamage).toBe(9);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(9);
  });

  it('halves damage, rounding down, on a save that meets the difficulty', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // mod +2, saveDifficulty 10
    const defender = buildCombatant({ constitution: 12 }); // mod +1

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    expect(result.savePassed).toBe(true);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(4);
  });

  it('treats a natural 20 save as an ordinary success, with no special negation (R12/Decision 4)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(20),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // mod +2, saveDifficulty 10
    const defender = buildCombatant({ constitution: 12 }); // mod +1

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    expect(result.savePassed).toBe(true);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(4);
  });

  it('treats a natural 1 save as an ordinary failure, with no special critical failure (R12/Decision 4)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(1),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // mod +2, saveDifficulty 10
    const defender = buildCombatant({ constitution: 12 }); // mod +1

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    expect(result.savePassed).toBe(false);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(9);
  });

  it('turns a failed save into a successful one when the attacker is POISONED (Decision G)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(8),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({
      magic: 14, // mod +2
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }],
    });
    const defender = buildCombatant({ constitution: 12 }); // mod +1

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    // Against the unpoisoned difficulty of 10 (previous scenario), the
    // identical roll of 9 fails. Against the POISONED-lowered difficulty
    // of 8, the same roll succeeds.
    expect(result.difficulty).toBe(8);
    expect(result.savePassed).toBe(true);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(4);
  });

  it('never lowers the difficulty from the defender being POISONED, only from the attacker (Decision G)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(8),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // unpoisoned, mod +2
    const defender = buildCombatant({
      constitution: 12, // mod +1
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }],
    });

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 0,
      random,
    });

    expect(result.difficulty).toBe(10);
    expect(result.savePassed).toBe(false);
    expect(
      reduceDamage(result.rawDamage, {
        dealerWeakened: false,
        savePassed: result.savePassed,
        mitigation: null,
        reactor: defender,
      }),
    ).toBe(9);
  });

  it('adds ARCANE_WARD bonus to the defender roll, not to the difficulty', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(8),
      rollDice: jest.fn().mockReturnValue(9),
    };
    const attacker = buildCombatant({ magic: 14 }); // mod +2, saveDifficulty 10
    const defender = buildCombatant({ constitution: 12 }); // mod +1, total 9 without ward

    const result = resolveMagicAttack({
      attacker,
      defender,
      skill: fireball,
      wardBonus: 2,
      random,
    });

    expect(result.difficulty).toBe(10);
    expect(result.savePassed).toBe(true);
  });
});

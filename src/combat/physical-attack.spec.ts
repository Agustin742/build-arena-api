import { resolvePhysicalAttack } from './physical-attack';
import type { RandomSource } from './random-source';
import type { Combatant, CombatSkill } from './types';

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

const powerStrike: CombatSkill = {
  code: 'POWER_STRIKE',
  type: 'ACTION',
  requiredAttribute: 'STRENGTH',
  damageDice: '1d8',
  appliesCondition: null,
  conditionRounds: null,
};

const preciseShot: CombatSkill = {
  code: 'PRECISE_SHOT',
  type: 'ACTION',
  requiredAttribute: 'DEXTERITY',
  damageDice: '1d6',
  appliesCondition: null,
  conditionRounds: null,
};

describe('resolvePhysicalAttack', () => {
  it('hits and deals damage when the target value meets armor class', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn().mockReturnValue(5),
    };
    const attacker = buildCombatant({ strength: 14 }); // mod +2

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 14,
      bias: 'NORMAL',
      random,
    });

    expect(result.hit).toBe(true);
    expect(result.critical).toBe(false);
    expect(result.rawDamage).toBe(7);
  });

  it('misses and rolls no damage dice when the total falls short', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(8),
      rollDice: jest.fn(),
    };
    const attacker = buildCombatant({ strength: 14 }); // mod +2

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 14,
      bias: 'NORMAL',
      random,
    });

    expect(result.hit).toBe(false);
    expect(result.rawDamage).toBe(0);
    expect(random.rollDice).not.toHaveBeenCalled();
  });

  it('a natural 20 is an automatic critical hit even against a high armor class (Decision E)', () => {
    const rollDice = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(3);
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(20),
      rollDice,
    };
    const attacker = buildCombatant({ strength: 14 }); // mod +2

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 18,
      bias: 'NORMAL',
      random,
    });

    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
    expect(result.rawDamage).toBe(10);
    expect(rollDice).toHaveBeenCalledTimes(2);
  });

  it('a natural 1 is an automatic miss even when the total would meet armor class (Decision E)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(1),
      rollDice: jest.fn(),
    };
    const attacker = buildCombatant({ strength: 20 }); // mod +5

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 6,
      bias: 'NORMAL',
      random,
    });

    expect(result.hit).toBe(false);
    expect(result.rawDamage).toBe(0);
    expect(random.rollDice).not.toHaveBeenCalled();
  });

  it('resolves PRECISE_SHOT with dexterity, not strength (R14)', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(12),
      rollDice: jest.fn().mockReturnValue(4),
    };
    const attacker = buildCombatant({ dexterity: 12, strength: 18 }); // dex mod +1, str mod +4

    const result = resolvePhysicalAttack({
      attacker,
      skill: preciseShot,
      armorClass: 12,
      bias: 'NORMAL',
      random,
    });

    expect(result.targetValue).toBe(13);
    expect(result.hit).toBe(true);
    expect(result.rawDamage).toBe(5);
  });

  it('advantage keeps the natural 20 and criticals, so advantage can only raise the critical chance', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValueOnce(20).mockReturnValueOnce(5),
      rollDice: jest.fn().mockReturnValue(4),
    };
    const attacker = buildCombatant({ strength: 10 }); // mod 0

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 25,
      bias: 'ADVANTAGE',
      random,
    });

    // The discarded 5 would have missed armor class 25 and never criticalled.
    // Keeping the higher die is what lifts the critical rate from 5% to about
    // 9.75%: advantage can raise the critical chance but never lower it.
    expect(random.rollD20).toHaveBeenCalledTimes(2);
    expect(result.rolls).toEqual([20, 5]);
    expect(result.kept).toBe(20);
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
    expect(random.rollDice).toHaveBeenCalledTimes(2);
    expect(result.rawDamage).toBe(8);
  });
});

import {
  applyCondition,
  attackBiasFor,
  conditionFromSkill,
  isStunned,
  isWeakened,
} from './conditions';
import { resolvePhysicalAttack } from '../attack/physical-attack';
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

const powerStrike: CombatSkill = {
  code: 'POWER_STRIKE',
  type: 'ACTION',
  requiredAttribute: 'STRENGTH',
  damageDice: '1d8',
  appliesCondition: null,
  conditionRounds: null,
};

const venomBolt: CombatSkill = {
  code: 'VENOM_BOLT',
  type: 'ACTION',
  requiredAttribute: 'MAGIC',
  damageDice: '2d6',
  appliesCondition: 'POISONED',
  conditionRounds: 3,
};

describe('attackBiasFor', () => {
  it('gives a poisoned attacker disadvantage on physical attack rolls (R1)', () => {
    const attacker = buildCombatant({
      strength: 14, // mod +2
      conditions: [{ type: 'POISONED', roundsRemaining: 2 }],
    });
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValueOnce(16).mockReturnValueOnce(6),
      rollDice: jest.fn(),
    };

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 14,
      bias: attackBiasFor(attacker),
      random,
    });

    // The higher discarded roll (16 + 2 = 18) would have hit; the kept
    // lower roll (6 + 2 = 8) misses, proving disadvantage was applied.
    expect(result.kept).toBe(6);
    expect(result.total).toBe(8);
    expect(result.hit).toBe(false);
  });

  it('rolls a normal, unbiased attack when no POISONED condition is active', () => {
    const attacker = buildCombatant({ strength: 14 }); // mod +2, no conditions
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(6),
      rollDice: jest.fn(),
    };

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 14,
      bias: attackBiasFor(attacker),
      random,
    });

    expect(random.rollD20).toHaveBeenCalledTimes(1);
    expect(result.kept).toBe(6);
  });

  it('never lowers the target armor class for a poisoned physical attacker (R1, Decision G)', () => {
    const attacker = buildCombatant({
      strength: 10, // mod 0
      conditions: [{ type: 'POISONED', roundsRemaining: 3 }],
    });
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValueOnce(10).mockReturnValueOnce(10),
      rollDice: jest.fn(),
    };

    const result = resolvePhysicalAttack({
      attacker,
      skill: powerStrike,
      armorClass: 14,
      bias: attackBiasFor(attacker),
      random,
    });

    // 10 + mod(10)=0 = 10, unmodified armor class of 14 still applies: a
    // -2 belongs only to the saving throw difficulty a magic attack
    // imposes, and a physical attack imposes none.
    expect(result.total).toBe(10);
    expect(result.hit).toBe(false);
  });
});

describe('isStunned', () => {
  it('is true when STUNNED is active (R2)', () => {
    const combatant = buildCombatant({
      conditions: [{ type: 'STUNNED', roundsRemaining: 1 }],
    });

    expect(isStunned(combatant)).toBe(true);
  });

  it('is false when STUNNED is not active', () => {
    const combatant = buildCombatant({
      conditions: [{ type: 'WEAKENED', roundsRemaining: 2 }],
    });

    expect(isStunned(combatant)).toBe(false);
  });
});

describe('isWeakened', () => {
  it('is true when WEAKENED is active (R3)', () => {
    const combatant = buildCombatant({
      conditions: [{ type: 'WEAKENED', roundsRemaining: 1 }],
    });

    expect(isWeakened(combatant)).toBe(true);
  });

  it('is false when WEAKENED is not active', () => {
    const combatant = buildCombatant({
      conditions: [{ type: 'STUNNED', roundsRemaining: 1 }],
    });

    expect(isWeakened(combatant)).toBe(false);
  });
});

describe('applyCondition', () => {
  it('adds a new condition when none of that type is active', () => {
    const combatant = buildCombatant();

    const { combatant: updated, refreshed } = applyCondition(combatant, {
      type: 'POISONED',
      roundsRemaining: 3,
    });

    expect(refreshed).toBe(false);
    expect(updated.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 3 },
    ]);
  });

  it('refreshes roundsRemaining instead of stacking a second entry (R16)', () => {
    const combatant = buildCombatant({
      conditions: [{ type: 'POISONED', roundsRemaining: 1 }],
    });

    const { combatant: updated, refreshed } = applyCondition(combatant, {
      type: 'POISONED',
      roundsRemaining: 3,
    });

    expect(refreshed).toBe(true);
    expect(updated.conditions).toEqual([
      { type: 'POISONED', roundsRemaining: 3 },
    ]);
  });
});

describe('conditionFromSkill', () => {
  it('reads the condition and duration a skill applies', () => {
    expect(conditionFromSkill(venomBolt)).toEqual({
      type: 'POISONED',
      rounds: 3,
    });
  });

  it('returns null for a skill that applies no condition', () => {
    expect(conditionFromSkill(powerStrike)).toBeNull();
  });
});

import { attributeOf, reduceDamage, rollDamage } from './damage';
import { modifier } from '../core/arithmetic';
import type { RandomSource } from '../core/random-source';
import type { Combatant, MitigationSpec } from '../types';

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

describe('attributeOf', () => {
  it('reads each named attribute off a combatant', () => {
    const combatant = buildCombatant({
      strength: 11,
      magic: 12,
      dexterity: 13,
      constitution: 14,
    });

    expect(attributeOf(combatant, 'STRENGTH')).toBe(11);
    expect(attributeOf(combatant, 'MAGIC')).toBe(12);
    expect(attributeOf(combatant, 'DEXTERITY')).toBe(13);
    expect(attributeOf(combatant, 'CONSTITUTION')).toBe(14);
  });
});

describe('rollDamage', () => {
  it('rolls the notation once and adds the bonus for a non-critical hit', () => {
    const random: RandomSource = {
      rollD20: jest.fn(),
      rollDice: jest.fn().mockReturnValue(5),
    };

    expect(rollDamage(random, '1d8', 2, false)).toBe(7);
    expect(random.rollDice).toHaveBeenCalledTimes(1);
    expect(random.rollDice).toHaveBeenCalledWith('1d8');
  });

  it('rolls the notation twice and sums it for a critical hit (R15/D2)', () => {
    const rollDice = jest.fn().mockReturnValueOnce(5).mockReturnValueOnce(3);
    const random: RandomSource = { rollD20: jest.fn(), rollDice };

    // R15: the skill's own dice rolled twice, not the sum doubled or the
    // notation rewritten, so the call count is the assertion.
    expect(rollDamage(random, '2d6', 2, true)).toBe(10);
    expect(rollDice).toHaveBeenCalledTimes(2);
    expect(rollDice).toHaveBeenNthCalledWith(1, '2d6');
    expect(rollDice).toHaveBeenNthCalledWith(2, '2d6');
  });
});

describe('reduceDamage', () => {
  const reactor = buildCombatant();

  it('halves damage for a WEAKENED dealer (R3)', () => {
    expect(
      reduceDamage(7, {
        dealerWeakened: true,
        savePassed: false,
        mitigation: null,
        reactor,
      }),
    ).toBe(3);
  });

  it('halves damage on a successful save (overview.md §4.3)', () => {
    expect(
      reduceDamage(9, {
        dealerWeakened: false,
        savePassed: true,
        mitigation: null,
        reactor,
      }),
    ).toBe(4);
  });

  it('halves physical damage under PARRY (R6)', () => {
    const mitigation: MitigationSpec = { kind: 'HALVE' };

    expect(
      reduceDamage(9, {
        dealerWeakened: false,
        savePassed: false,
        mitigation,
        reactor,
      }),
    ).toBe(4);
  });

  it('applies WEAKENED and PARRY as two independent halvings, not one combined division (R6)', () => {
    const mitigation: MitigationSpec = { kind: 'HALVE' };

    expect(
      reduceDamage(11, {
        dealerWeakened: true,
        savePassed: false,
        mitigation,
        reactor,
      }),
    ).toBe(2);
  });

  it('reduces damage by the constitution modifier under BRACE (R5)', () => {
    const braceReactor = buildCombatant({ constitution: 14 }); // mod +2
    const mitigation: MitigationSpec = {
      kind: 'FLAT',
      from: 'CONSTITUTION',
      minimum: 1,
    };

    expect(
      reduceDamage(7, {
        dealerWeakened: false,
        savePassed: false,
        mitigation,
        reactor: braceReactor,
      }),
    ).toBe(5);
  });

  it('never reduces damage by less than 1 under BRACE (R5)', () => {
    const braceReactor = buildCombatant({ constitution: 8 }); // mod -1
    const mitigation: MitigationSpec = {
      kind: 'FLAT',
      from: 'CONSTITUTION',
      minimum: 1,
    };

    expect(modifier(braceReactor.constitution)).toBe(-1);
    expect(
      reduceDamage(4, {
        dealerWeakened: false,
        savePassed: false,
        mitigation,
        reactor: braceReactor,
      }),
    ).toBe(3);
  });

  it('fixes the reduction order as WEAKENED, then save, then PARRY, then BRACE last (D4)', () => {
    // A pin on the order itself: if BRACE ran before the halving instead of
    // after, 7 -2 = 5, then halve(5) = 2 -- a different, wrong result.
    const braceReactor = buildCombatant({ constitution: 14 }); // mod +2
    const mitigation: MitigationSpec = {
      kind: 'FLAT',
      from: 'CONSTITUTION',
      minimum: 1,
    };

    expect(
      reduceDamage(7, {
        dealerWeakened: true,
        savePassed: false,
        mitigation,
        reactor: braceReactor,
      }),
    ).toBe(1);
  });

  it('clamps the final result at zero', () => {
    expect(
      reduceDamage(-5, {
        dealerWeakened: false,
        savePassed: false,
        mitigation: null,
        reactor,
      }),
    ).toBe(0);
  });
});

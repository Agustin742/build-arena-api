import { armorClass, initiative, maxHp } from './derived-stats';
import type { RandomSource } from './random-source';

describe('armorClass', () => {
  it('matches the spec scenario: dexterity 14 (mod +2) -> armorClass 12', () => {
    expect(armorClass(14)).toBe(12);
  });

  it('drops below 10 for a negative dexterity modifier', () => {
    // dexterity 6 -> mod floor((6-10)/2) = -2 -> 10 + (-2) = 8
    expect(armorClass(6)).toBe(8);
  });
});

describe('maxHp', () => {
  it('matches the spec scenario: constitution 12 (mod +1) -> maxHp 35', () => {
    expect(maxHp(12)).toBe(35);
  });

  it('scales down for a negative constitution modifier', () => {
    // constitution 8 -> mod -1 -> 30 + (-1 * 5) = 25
    expect(maxHp(8)).toBe(25);
  });
});

describe('initiative', () => {
  it('adds the dexterity modifier to a rolled d20', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(15),
      rollDice: jest.fn(),
    };

    // dexterity 14 -> mod +2 -> 15 + 2 = 17
    expect(initiative(14, random)).toBe(17);
    expect(random.rollD20).toHaveBeenCalledTimes(1);
  });

  it('supports a negative dexterity modifier lowering the total', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(3),
      rollDice: jest.fn(),
    };

    // dexterity 8 -> mod -1 -> 3 + (-1) = 2
    expect(initiative(8, random)).toBe(2);
  });
});

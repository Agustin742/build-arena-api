import { SkillType } from '../../generated/prisma/enums';
import {
  ACTIONS_PER_BUILD,
  KIT_BUDGET,
  REACTIONS_PER_BUILD,
  kitCost,
} from './kit-cost';

const skill = (cost: number) => ({ cost, type: SkillType.ACTION });

describe('kitCost', () => {
  it('costs nothing for an empty kit', () => {
    expect(kitCost([])).toBe(0);
  });

  it('adds up the cost of every chosen skill', () => {
    expect(kitCost([skill(4), skill(4), skill(3), skill(4)])).toBe(15);
  });
});

describe('kit constants', () => {
  it('fits the cheapest kit of the catalog with three points to spare', () => {
    const cheapest = 4 + 4 + 3 + 4;

    expect(KIT_BUDGET - cheapest).toBe(3);
  });

  it('leaves the mono-strength kit out of reach', () => {
    const monoStrength = 6 + 4 + 6 + 4;

    expect(monoStrength).toBeGreaterThan(KIT_BUDGET);
  });

  it('keeps the two most expensive skills mutually exclusive', () => {
    const cheapestRemainingSlots = 4 + 3;

    expect(7 + 7 + cheapestRemainingSlots).toBeGreaterThan(KIT_BUDGET);
  });

  it('asks for two actions and two reactions', () => {
    expect(ACTIONS_PER_BUILD).toBe(2);
    expect(REACTIONS_PER_BUILD).toBe(2);
  });
});

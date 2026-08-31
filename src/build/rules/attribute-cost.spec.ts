import {
  ATTRIBUTE_BUDGET,
  BASE_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  attributeCost,
  spreadCost,
} from './attribute-cost';

describe('attributeCost', () => {
  it('charges nothing for the base value every build starts from', () => {
    expect(attributeCost(BASE_ATTRIBUTE_VALUE)).toBe(0);
  });

  it('follows the escalating table of the design', () => {
    const table = [
      [8, 0],
      [9, 1],
      [10, 2],
      [11, 3],
      [12, 4],
      [13, 5],
      [14, 7],
      [15, 9],
    ];

    for (const [value, cost] of table) {
      expect(attributeCost(value)).toBe(cost);
    }
  });

  it('accelerates past thirteen, which is what makes specialising hurt', () => {
    expect(attributeCost(13) - attributeCost(12)).toBe(1);
    expect(attributeCost(14) - attributeCost(13)).toBe(2);
    expect(attributeCost(15) - attributeCost(14)).toBe(2);
  });

  it('refuses values the table does not cover', () => {
    expect(() => attributeCost(BASE_ATTRIBUTE_VALUE - 1)).toThrow(RangeError);
    expect(() => attributeCost(MAX_ATTRIBUTE_VALUE + 1)).toThrow(RangeError);
    expect(() => attributeCost(12.5)).toThrow(RangeError);
  });
});

describe('spreadCost', () => {
  it('makes the three canonical spreads cost exactly the budget', () => {
    const specialist = {
      strength: 15,
      magic: 14,
      dexterity: 12,
      constitution: 8,
    };
    const balanced = {
      strength: 13,
      magic: 13,
      dexterity: 13,
      constitution: 13,
    };
    const hybrid = { strength: 15, magic: 13, dexterity: 12, constitution: 10 };

    expect(spreadCost(specialist)).toBe(ATTRIBUTE_BUDGET);
    expect(spreadCost(balanced)).toBe(ATTRIBUTE_BUDGET);
    expect(spreadCost(hybrid)).toBe(ATTRIBUTE_BUDGET);
  });

  it('costs nothing when every attribute stays at the base', () => {
    expect(
      spreadCost({
        strength: 8,
        magic: 8,
        dexterity: 8,
        constitution: 8,
      }),
    ).toBe(0);
  });

  it('leaves five points over the cheapest spread that unlocks four skills', () => {
    const floor = {
      strength: 12,
      magic: 11,
      dexterity: 12,
      constitution: 12,
    };

    expect(spreadCost(floor)).toBe(15);
    expect(ATTRIBUTE_BUDGET - spreadCost(floor)).toBe(5);
  });
});

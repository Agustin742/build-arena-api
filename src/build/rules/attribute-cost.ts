/**
 * Every build starts with all four attributes at this value and spends the
 * budget upwards from there.
 */
export const BASE_ATTRIBUTE_VALUE = 8;

/** The table stops here: nothing in the game reaches past it. */
export const MAX_ATTRIBUTE_VALUE = 15;

/**
 * Twenty points is the number that makes the specialist, balanced and hybrid
 * spreads cost exactly the same, so none of them dominates.
 */
export const ATTRIBUTE_BUDGET = 20;

/** Cumulative cost of reaching each value, indexed from the base value. */
const CUMULATIVE_COST = [0, 1, 2, 3, 4, 5, 7, 9];

export type BuildAttributes = {
  strength: number;
  magic: number;
  dexterity: number;
  constitution: number;
};

export function attributeCost(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < BASE_ATTRIBUTE_VALUE ||
    value > MAX_ATTRIBUTE_VALUE
  ) {
    throw new RangeError(
      `Attribute value must be an integer between ${BASE_ATTRIBUTE_VALUE} and ${MAX_ATTRIBUTE_VALUE}, got ${value}`,
    );
  }

  return CUMULATIVE_COST[value - BASE_ATTRIBUTE_VALUE];
}

export function spreadCost(attributes: BuildAttributes): number {
  return (
    attributeCost(attributes.strength) +
    attributeCost(attributes.magic) +
    attributeCost(attributes.dexterity) +
    attributeCost(attributes.constitution)
  );
}

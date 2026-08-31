import { clampDamage, halve, modifier } from './arithmetic';

describe('modifier', () => {
  it('rounds down at an odd score below 10', () => {
    // (9 - 10) / 2 = -0.5 -> floor -> -1
    expect(modifier(9)).toBe(-1);
  });

  it('rounds down at a very low, negative-producing score', () => {
    // (3 - 10) / 2 = -3.5 -> floor -> -4
    expect(modifier(3)).toBe(-4);
  });

  it('matches the spec scenario values for dexterity 14 and constitution 12', () => {
    expect(modifier(14)).toBe(2);
    expect(modifier(12)).toBe(1);
  });
});

describe('halve', () => {
  it('rounds down an odd positive value', () => {
    expect(halve(9)).toBe(4);
  });

  it('rounds toward negative infinity for a negative odd value', () => {
    expect(halve(-3)).toBe(-2);
  });
});

describe('clampDamage', () => {
  it('floors a negative value to zero', () => {
    expect(clampDamage(-5)).toBe(0);
  });

  it('leaves a non-negative value untouched', () => {
    expect(clampDamage(7)).toBe(7);
  });
});

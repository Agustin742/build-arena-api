import { resolveBias, rollD20With } from './d20';
import type { RandomSource } from './random-source';

describe('resolveBias', () => {
  it.each([
    [false, false, 'NORMAL'],
    [true, false, 'ADVANTAGE'],
    [false, true, 'DISADVANTAGE'],
    [true, true, 'NORMAL'],
  ] as const)(
    'advantage=%s disadvantage=%s -> %s',
    (advantage, disadvantage, expected) => {
      expect(resolveBias(advantage, disadvantage)).toBe(expected);
    },
  );
});

describe('rollD20With', () => {
  it('rolls once under NORMAL bias', () => {
    const random: RandomSource = {
      rollD20: jest.fn().mockReturnValue(11),
      rollDice: jest.fn(),
    };

    expect(rollD20With(random, 'NORMAL')).toEqual({ rolls: [11], kept: 11 });
    expect(random.rollD20).toHaveBeenCalledTimes(1);
  });

  it('keeps the higher roll under ADVANTAGE', () => {
    const rollD20 = jest.fn().mockReturnValueOnce(7).mockReturnValueOnce(15);
    const random: RandomSource = { rollD20, rollDice: jest.fn() };

    expect(rollD20With(random, 'ADVANTAGE')).toEqual({
      rolls: [7, 15],
      kept: 15,
    });
    expect(rollD20).toHaveBeenCalledTimes(2);
  });

  it('keeps the lower roll under DISADVANTAGE', () => {
    const rollD20 = jest.fn().mockReturnValueOnce(7).mockReturnValueOnce(15);
    const random: RandomSource = { rollD20, rollDice: jest.fn() };

    expect(rollD20With(random, 'DISADVANTAGE')).toEqual({
      rolls: [7, 15],
      kept: 7,
    });
    expect(rollD20).toHaveBeenCalledTimes(2);
  });

  it('resolveBias cancellation collapses ADVANTAGE+DISADVANTAGE into a single roll via rollD20With', () => {
    const rollD20 = jest.fn().mockReturnValue(9);
    const random: RandomSource = { rollD20, rollDice: jest.fn() };
    const bias = resolveBias(true, true);

    expect(rollD20With(random, bias)).toEqual({ rolls: [9], kept: 9 });
    expect(rollD20).toHaveBeenCalledTimes(1);
  });
});

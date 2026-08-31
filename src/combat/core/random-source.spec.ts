import { SequenceRandomSource, SystemRandomSource } from './random-source';

describe('SystemRandomSource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rollD20 maps the lowest random draw to 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const random = new SystemRandomSource();

    expect(random.rollD20()).toBe(1);
  });

  it('rollD20 maps the highest random draw to 20', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9999);
    const random = new SystemRandomSource();

    expect(random.rollD20()).toBe(20);
  });

  it('rollDice parses "NdM" and sums exactly N draws of a d-M die', () => {
    const draws = [0, 0.5, 0.9999];
    let call = 0;
    jest.spyOn(Math, 'random').mockImplementation(() => draws[call++]);
    const random = new SystemRandomSource();

    // 3d6: die(6) draws -> floor(0*6)+1=1, floor(0.5*6)+1=4, floor(0.9999*6)+1=6
    expect(random.rollDice('3d6')).toBe(1 + 4 + 6);
    expect(call).toBe(3);
  });

  it('rollDice rejects a notation that is not "NdM"', () => {
    const random = new SystemRandomSource();

    expect(() => random.rollDice('not-dice')).toThrow();
  });
});

describe('SequenceRandomSource', () => {
  it('replays rollD20 draws from the script in order', () => {
    const random = new SequenceRandomSource([7, 15]);

    expect(random.rollD20()).toBe(7);
    expect(random.rollD20()).toBe(15);
  });

  it('rollDice consumes exactly N values from the script and sums them', () => {
    const random = new SequenceRandomSource([5, 3]);

    expect(random.rollDice('2d6')).toBe(8);
  });

  it('rollDice consumes a single value for a "1dM" notation', () => {
    const random = new SequenceRandomSource([4]);

    expect(random.rollDice('1d8')).toBe(4);
  });

  it('throws when the script is exhausted', () => {
    const random = new SequenceRandomSource([1]);
    random.rollD20();

    expect(() => random.rollD20()).toThrow();
  });

  it('throws when a rollDice call needs more values than remain in the script', () => {
    const random = new SequenceRandomSource([1]);

    expect(() => random.rollDice('2d6')).toThrow();
  });

  it('rejects a notation that is not "NdM"', () => {
    const random = new SequenceRandomSource([1, 2]);

    expect(() => random.rollDice('2x6')).toThrow();
  });
});

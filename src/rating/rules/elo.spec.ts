import { K_FACTOR, ratingChange, expectedScore } from './elo';

describe('expectedScore', () => {
  it('gives two equal ratings an even chance', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5, 10);
  });

  it('gives a 400 point lead the classic ten to one odds', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(10 / 11, 10);
  });

  it('is symmetric: the two expectations always add up to one', () => {
    const pairs = [
      [1200, 1200],
      [1600, 1200],
      [900, 2100],
      [1234, 1187],
    ];

    for (const [a, b] of pairs) {
      expect(expectedScore(a, b) + expectedScore(b, a)).toBeCloseTo(1, 10);
    }
  });
});

describe('ratingChange', () => {
  it('splits the K factor evenly when both players are equally rated', () => {
    const change = ratingChange(1200, 1200);

    expect(change.winner).toBe(K_FACTOR / 2);
    expect(change.loser).toBe(-K_FACTOR / 2);
  });

  it('pays little for beating someone far below you', () => {
    const change = ratingChange(2000, 1200);

    expect(change.winner).toBeGreaterThan(0);
    expect(change.winner).toBeLessThan(K_FACTOR / 2);
  });

  it('pays a lot for beating someone far above you', () => {
    const change = ratingChange(1200, 2000);

    expect(change.winner).toBeGreaterThan(K_FACTOR / 2);
    expect(change.winner).toBeLessThanOrEqual(K_FACTOR);
  });

  // The whole point of deriving the loser's number from the winner's rather
  // than rounding each side on its own: the table cannot mint or burn rating
  // behind anyone's back, so the sum across every player never drifts.
  it('is zero sum, so the pool of rating in the table never changes', () => {
    const pairs = [
      [1200, 1200],
      [2400, 800],
      [800, 2400],
      [1315, 1288],
      [1000, 1001],
    ];

    for (const [winner, loser] of pairs) {
      const change = ratingChange(winner, loser);
      expect(change.winner + change.loser).toBe(0);
    }
  });

  it('always moves the rating by a whole number of points', () => {
    const change = ratingChange(1337, 1201);

    expect(Number.isInteger(change.winner)).toBe(true);
    expect(Number.isInteger(change.loser)).toBe(true);
  });

  // A win must never be punished and a loss must never be rewarded, however
  // lopsided the pairing is. At extreme gaps the rounded expectation reaches
  // 1, and a naive round() would hand the winner a flat zero.
  it('never lets a win cost points, even against a hopeless opponent', () => {
    const change = ratingChange(3000, 100);

    expect(change.winner).toBeGreaterThan(0);
    expect(change.loser).toBeLessThan(0);
  });
});

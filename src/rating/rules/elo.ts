/**
 * Elo, and nothing else. No Prisma, no Nest, no clock — the same discipline
 * `src/combat` keeps, for the same reason: a rating rule that needs a
 * database to be exercised is a rating rule nobody exercises.
 */

/**
 * How many points a single result can move a rating at most. 32 is the
 * classic value for a rated player and it is the right end of the trade for
 * this project: lower it and a leaderboard built from a handful of duels
 * never separates anyone, raise it and one lucky d20 outranks a week of play.
 */
export const K_FACTOR = 32;

/**
 * The odds the design's §2.7 leans on: every 400 points of gap is ten to one.
 * Returns `player`'s share of an expected result against `rival`, between 0
 * and 1.
 */
export const expectedScore = (player: number, rival: number): number =>
  1 / (1 + 10 ** ((rival - player) / 400));

export type RatingChange = {
  /** Always positive: the points the winner gains. */
  readonly winner: number;
  /** Always the winner's number negated, so the two cancel out exactly. */
  readonly loser: number;
};

/**
 * The points a decided duel moves, given both ratings BEFORE it.
 *
 * The loser's number is the winner's negated rather than a second rounding
 * of its own. Rounding each side separately lets a duel quietly mint or burn
 * a point, and across a season that drift is what makes a leaderboard stop
 * meaning anything. Here the pool of rating in the table is conserved by
 * construction.
 *
 * The floor of 1 is not cosmetic. Past roughly 800 points of gap the expected
 * score rounds to a flat 1, and an unguarded formula would hand the winner
 * zero — a win that costs nothing is fine, a win worth literally nothing is a
 * bug the leaderboard would show as a tie.
 */
export const ratingChange = (winner: number, loser: number): RatingChange => {
  const gained = Math.max(
    1,
    Math.round(K_FACTOR * (1 - expectedScore(winner, loser))),
  );

  return { winner: gained, loser: -gained };
};

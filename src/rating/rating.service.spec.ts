import { RatingService } from './rating.service';
import { K_FACTOR } from './rules/elo';

const CHALLENGER = '11111111-1111-4111-8111-111111111111';
const OPPONENT = '22222222-2222-4222-8222-222222222222';

/** Just the two calls `settle` makes: read both players, write each one. */
const buildTx = (ratings: Record<string, number>) => ({
  user: {
    findMany: jest
      .fn()
      .mockResolvedValue(
        Object.entries(ratings).map(([id, rating]) => ({ id, rating })),
      ),
    update: jest.fn().mockResolvedValue(undefined),
  },
});

const battle = (ranked: boolean) => ({
  challengerId: CHALLENGER,
  opponentId: OPPONENT,
  ranked,
});

describe('RatingService.settle', () => {
  it('moves both ratings by the same points in opposite directions', async () => {
    const tx = buildTx({ [CHALLENGER]: 1200, [OPPONENT]: 1200 });

    const outcome = await new RatingService().settle(
      tx as never,
      battle(true),
      CHALLENGER,
    );

    const winner = outcome.changes.find((c) => c.userId === CHALLENGER);
    const loser = outcome.changes.find((c) => c.userId === OPPONENT);

    expect(winner).toEqual({
      userId: CHALLENGER,
      before: 1200,
      change: K_FACTOR / 2,
      after: 1200 + K_FACTOR / 2,
    });
    expect(loser).toEqual({
      userId: OPPONENT,
      before: 1200,
      change: -K_FACTOR / 2,
      after: 1200 - K_FACTOR / 2,
    });
  });

  it('writes exactly one update per player, with the computed rating', async () => {
    const tx = buildTx({ [CHALLENGER]: 1400, [OPPONENT]: 1100 });

    const outcome = await new RatingService().settle(
      tx as never,
      battle(true),
      OPPONENT,
    );

    expect(tx.user.update).toHaveBeenCalledTimes(2);

    const written = tx.user.update.mock.calls.map(
      ([args]: [{ where: { id: string }; data: { rating: number } }]) => ({
        id: args.where.id,
        rating: args.data.rating,
      }),
    );

    for (const change of outcome.changes) {
      expect(written).toContainEqual({
        id: change.userId,
        rating: change.after,
      });
    }
  });

  // §2.8: two friends could otherwise take turns losing to climb the ranking.
  it('touches nobody when the battle is not ranked', async () => {
    const tx = buildTx({ [CHALLENGER]: 1200, [OPPONENT]: 1200 });

    const outcome = await new RatingService().settle(
      tx as never,
      battle(false),
      CHALLENGER,
    );

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(outcome.ranked).toBe(false);
  });

  // The lesson `targetValue` taught: a field that disappears to mean
  // something is a field a client has to guess at. An unranked duel reports
  // real ratings and a change of zero, so `battle:ended` reads the same way
  // every time.
  it('still reports both players, with a change of zero, when unranked', async () => {
    const tx = buildTx({ [CHALLENGER]: 1310, [OPPONENT]: 1290 });

    const outcome = await new RatingService().settle(
      tx as never,
      battle(false),
      CHALLENGER,
    );

    expect(outcome.changes).toHaveLength(2);
    for (const change of outcome.changes) {
      expect(change.change).toBe(0);
      expect(change.after).toBe(change.before);
    }
  });

  it('reads the ratings from storage, never from the caller', async () => {
    const tx = buildTx({ [CHALLENGER]: 1500, [OPPONENT]: 900 });

    await new RatingService().settle(tx as never, battle(true), CHALLENGER);

    const [args] = tx.user.findMany.mock.calls[0] as [
      { where: { id: { in: string[] } } },
    ];

    expect(args.where.id.in).toEqual(
      expect.arrayContaining([CHALLENGER, OPPONENT]),
    );
  });

  it('refuses to settle a battle whose winner is not one of the two players', async () => {
    const tx = buildTx({ [CHALLENGER]: 1200, [OPPONENT]: 1200 });

    await expect(
      new RatingService().settle(
        tx as never,
        battle(true),
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toThrow(/winner/i);
  });
});

import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import { ratingChange } from './rules/elo';

/** The two players of a battle, plus whether it counts. */
export type SettleableBattle = {
  readonly challengerId: string;
  readonly opponentId: string;
  readonly ranked: boolean;
};

/** What one player's rating did, in full: no reader has to subtract. */
export type PlayerRatingChange = {
  readonly userId: string;
  readonly before: number;
  readonly change: number;
  readonly after: number;
};

export type RatingOutcome = {
  readonly ranked: boolean;
  /** Always both players, ranked or not. */
  readonly changes: readonly PlayerRatingChange[];
};

@Injectable()
export class RatingService {
  /**
   * Applies a decided battle to both players' ratings, inside the caller's
   * transaction — the same one that closes the battle. A finished battle and
   * the rating it moved must land together or not at all; a closure that
   * committed without its rating write would be invisible and unrepeatable,
   * because nothing re-closes an already finished battle.
   *
   * Both ratings are read here rather than taken from the caller. Whoever
   * closes a battle is holding combatant rows frozen at the challenge, and a
   * player's rating moves between battles.
   */
  async settle(
    tx: Prisma.TransactionClient,
    battle: SettleableBattle,
    winnerId: string,
  ): Promise<RatingOutcome> {
    if (winnerId !== battle.challengerId && winnerId !== battle.opponentId) {
      throw new Error(
        `Cannot settle rating: winner ${winnerId} is not in this battle`,
      );
    }

    const loserId =
      winnerId === battle.challengerId
        ? battle.opponentId
        : battle.challengerId;

    const players = await tx.user.findMany({
      where: { id: { in: [winnerId, loserId] } },
      select: { id: true, rating: true },
    });

    const ratingOf = (userId: string): number => {
      const player = players.find((candidate) => candidate.id === userId);

      if (!player) {
        throw new Error(`Cannot settle rating: player ${userId} is missing`);
      }

      return player.rating;
    };

    const winnerBefore = ratingOf(winnerId);
    const loserBefore = ratingOf(loserId);

    // §2.8: a duel between friends is unranked, so it reports the truth and
    // moves nothing. The zeros are deliberate — see `RatingOutcome`.
    const delta = battle.ranked
      ? ratingChange(winnerBefore, loserBefore)
      : { winner: 0, loser: 0 };

    const changes: PlayerRatingChange[] = [
      {
        userId: winnerId,
        before: winnerBefore,
        change: delta.winner,
        after: winnerBefore + delta.winner,
      },
      {
        userId: loserId,
        before: loserBefore,
        change: delta.loser,
        after: loserBefore + delta.loser,
      },
    ];

    if (battle.ranked) {
      for (const change of changes) {
        await tx.user.update({
          where: { id: change.userId },
          data: { rating: change.after },
        });
      }
    }

    return { ranked: battle.ranked, changes };
  }
}

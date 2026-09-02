import { Injectable } from '@nestjs/common';

import { PLAYER_COLUMNS } from '../common/public-player';
import type { PublicPlayer } from '../common/public-player';
import { PrismaService } from '../prisma/prisma.service';

/** How many players a request returns when it does not say. */
export const DEFAULT_PAGE_SIZE = 50;

/** The largest page a caller may ask for. */
export const MAX_PAGE_SIZE = 100;

export type LeaderboardEntry = PublicPlayer & {
  /** Position on the board, starting at 1. */
  readonly rank: number;
};

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The global ranking. Reads through `PLAYER_COLUMNS`, the one `select`
   * allowed to put another player on the wire — a leaderboard leaking an
   * email would be the same breach as the user endpoint leaking one.
   *
   * `username` breaks rating ties. Postgres is free to return equal rows in
   * any order it likes, so without a second key two players on the same
   * rating trade places between refreshes and the board looks unstable to
   * anyone watching it.
   */
  async findTop(limit: number | undefined): Promise<LeaderboardEntry[]> {
    const players = await this.prisma.user.findMany({
      ...PLAYER_COLUMNS,
      orderBy: [{ rating: 'desc' }, { username: 'asc' }],
      take: limit ?? DEFAULT_PAGE_SIZE,
    });

    return players.map((player, index) => ({ ...player, rank: index + 1 }));
  }
}

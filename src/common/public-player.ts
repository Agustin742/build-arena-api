/**
 * The only columns of another player any module is allowed to put on the wire.
 * Friendships and battles both render rivals, and both must stop at the same
 * three fields: an email or a password hash leaking through a battle listing
 * would be the same breach as leaking it through the user endpoint.
 */
export type PublicPlayer = {
  id: string;
  username: string;
  rating: number;
};

/** The Prisma `select` that produces exactly a `PublicPlayer`. */
export const PLAYER_COLUMNS = {
  select: { id: true, username: true, rating: true },
} as const;

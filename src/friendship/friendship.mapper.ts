import type { Friendship } from '../generated/prisma/client';
import type { FriendshipStatus } from '../generated/prisma/enums';

/** The only columns of a rival a friendship view is allowed to carry. */
export type PublicPlayer = {
  id: string;
  username: string;
  rating: number;
};

export const PLAYER_COLUMNS = {
  select: { id: true, username: true, rating: true },
} as const;

export type FriendshipWithPlayers = Friendship & {
  requester: PublicPlayer;
  addressee: PublicPlayer;
};

export type PublicFriendship = {
  id: string;
  status: FriendshipStatus;
  direction: 'OUTGOING' | 'INCOMING';
  player: PublicPlayer;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A friendship is one row, but each side sees a different thing in it: the
 * OTHER player, and whether the request left or arrived. Rendering it against
 * the viewer keeps both participant ids off the wire.
 */
export function toPublicFriendship(
  friendship: FriendshipWithPlayers,
  viewerId: string,
): PublicFriendship {
  const outgoing = friendship.requesterId === viewerId;

  return {
    id: friendship.id,
    status: friendship.status,
    direction: outgoing ? 'OUTGOING' : 'INCOMING',
    player: outgoing ? friendship.addressee : friendship.requester,
    createdAt: friendship.createdAt,
    updatedAt: friendship.updatedAt,
  };
}

import { FriendshipStatus } from '../../generated/prisma/enums';

/** The two sides of a friendship row, in the order the row stores them. */
export type FriendshipPair = {
  requesterId: string;
  addresseeId: string;
};

export type StoredFriendship = FriendshipPair & {
  status: FriendshipStatus;
};

export type FriendshipRule = 'SELF_FRIENDSHIP' | 'DUPLICATE_REQUEST';

export type FriendshipRuleViolation = {
  rule: FriendshipRule;
  message: string;
};

export type FriendshipTransition = 'ACCEPT' | 'REJECT' | 'CANCEL' | 'REMOVE';

/**
 * Why a transition was refused. `NOT_A_PARTICIPANT` is the only reason that
 * must not tell the caller anything about the row, so the service answers it
 * with a 404 and the other two with a 403.
 */
export type TransitionDenialReason =
  'NOT_A_PARTICIPANT' | 'WRONG_STATUS' | 'NOT_ENTITLED';

export type TransitionOutcome =
  | { allowed: true; transition: FriendshipTransition }
  | { allowed: false; reason: TransitionDenialReason; message: string };

const isParticipant = (
  friendship: StoredFriendship,
  actorId: string,
): boolean =>
  friendship.requesterId === actorId || friendship.addresseeId === actorId;

const outsider = (): TransitionOutcome => ({
  allowed: false,
  reason: 'NOT_A_PARTICIPANT',
  message: 'The friendship does not exist, or you are not part of it',
});

/**
 * Whether a request may be opened at all. An empty list means it may. The
 * caller resolves `existing` with a query that looks at BOTH directions,
 * because `@@unique([requesterId, addresseeId])` only covers one of them.
 */
export function validateFriendshipRequest(
  draft: FriendshipPair,
  existing: StoredFriendship | null,
): FriendshipRuleViolation[] {
  if (draft.requesterId === draft.addresseeId) {
    return [
      {
        rule: 'SELF_FRIENDSHIP',
        message: 'You cannot befriend yourself',
      },
    ];
  }

  if (existing) {
    return [
      {
        rule: 'DUPLICATE_REQUEST',
        message:
          existing.status === FriendshipStatus.ACCEPTED
            ? 'You are already friends with that player'
            : 'A friend request between you two is already pending',
      },
    ];
  }

  return [];
}

/**
 * Accepting is the transition the design guards twice (§8.2): the request must
 * be pending, AND the caller must be the addressee. Checking only the status
 * would let the requester accept their own request.
 */
export function acceptRequest(
  friendship: StoredFriendship,
  actorId: string,
): TransitionOutcome {
  if (!isParticipant(friendship, actorId)) {
    return outsider();
  }

  if (friendship.status !== FriendshipStatus.PENDING) {
    return {
      allowed: false,
      reason: 'WRONG_STATUS',
      message: 'Only a pending request can be accepted',
    };
  }

  if (friendship.addresseeId !== actorId) {
    return {
      allowed: false,
      reason: 'NOT_ENTITLED',
      message: 'Only the addressee can accept a friend request',
    };
  }

  return { allowed: true, transition: 'ACCEPT' };
}

/**
 * Dropping a friendship row is three different transitions wearing one verb:
 * the addressee rejects a pending request, the requester cancels it, and
 * either side removes an accepted friendship. Both participants may always
 * drop, so this names WHICH transition happened rather than refusing one.
 */
export function removeFriendship(
  friendship: StoredFriendship,
  actorId: string,
): TransitionOutcome {
  if (!isParticipant(friendship, actorId)) {
    return outsider();
  }

  if (friendship.status === FriendshipStatus.ACCEPTED) {
    return { allowed: true, transition: 'REMOVE' };
  }

  return {
    allowed: true,
    transition: friendship.addresseeId === actorId ? 'REJECT' : 'CANCEL',
  };
}

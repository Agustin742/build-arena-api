import { FriendshipStatus } from '../../generated/prisma/enums';
import {
  acceptRequest,
  removeFriendship,
  validateFriendshipRequest,
} from './friendship-rules';
import type { StoredFriendship } from './friendship-rules';

const REQUESTER = '11111111-0000-4000-8000-000000000001';
const ADDRESSEE = '22222222-0000-4000-8000-000000000002';
const STRANGER = '33333333-0000-4000-8000-000000000003';

const friendship = (status: FriendshipStatus): StoredFriendship => ({
  requesterId: REQUESTER,
  addresseeId: ADDRESSEE,
  status,
});

/** The rules a draft broke, by name. */
const brokenRules = (
  ...args: Parameters<typeof validateFriendshipRequest>
): string[] => validateFriendshipRequest(...args).map((entry) => entry.rule);

describe('validateFriendshipRequest', () => {
  it('accepts a request towards somebody else with no history', () => {
    expect(
      validateFriendshipRequest(
        { requesterId: REQUESTER, addresseeId: ADDRESSEE },
        null,
      ),
    ).toEqual([]);
  });

  it('rejects befriending yourself', () => {
    expect(
      brokenRules({ requesterId: REQUESTER, addresseeId: REQUESTER }, null),
    ).toEqual(['SELF_FRIENDSHIP']);
  });

  it('rejects a second request in the same direction', () => {
    expect(
      brokenRules(
        { requesterId: REQUESTER, addresseeId: ADDRESSEE },
        friendship(FriendshipStatus.PENDING),
      ),
    ).toEqual(['DUPLICATE_REQUEST']);
  });

  it('rejects a request in the opposite direction of a pending one', () => {
    // The unique index only covers (requesterId, addresseeId). The mirror
    // pair is a different row, so only this rule stops A -> B and B -> A
    // from both existing.
    expect(
      brokenRules(
        { requesterId: ADDRESSEE, addresseeId: REQUESTER },
        friendship(FriendshipStatus.PENDING),
      ),
    ).toEqual(['DUPLICATE_REQUEST']);
  });

  it('rejects a request towards somebody already accepted', () => {
    expect(
      brokenRules(
        { requesterId: ADDRESSEE, addresseeId: REQUESTER },
        friendship(FriendshipStatus.ACCEPTED),
      ),
    ).toEqual(['DUPLICATE_REQUEST']);
  });

  it('reports self friendship on its own, without querying history', () => {
    expect(
      brokenRules(
        { requesterId: REQUESTER, addresseeId: REQUESTER },
        friendship(FriendshipStatus.PENDING),
      ),
    ).toEqual(['SELF_FRIENDSHIP']);
  });
});

describe('acceptRequest', () => {
  it('lets the addressee accept a pending request', () => {
    expect(
      acceptRequest(friendship(FriendshipStatus.PENDING), ADDRESSEE),
    ).toEqual({ allowed: true, transition: 'ACCEPT' });
  });

  it('does not let the requester accept their own request', () => {
    // The trap of the phase: PENDING says the request is open, not who may
    // answer it.
    expect(
      acceptRequest(friendship(FriendshipStatus.PENDING), REQUESTER),
    ).toMatchObject({ allowed: false, reason: 'NOT_ENTITLED' });
  });

  it('does not let a stranger accept a request', () => {
    expect(
      acceptRequest(friendship(FriendshipStatus.PENDING), STRANGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_A_PARTICIPANT' });
  });

  it('does not accept a friendship that is already accepted', () => {
    expect(
      acceptRequest(friendship(FriendshipStatus.ACCEPTED), ADDRESSEE),
    ).toMatchObject({ allowed: false, reason: 'WRONG_STATUS' });
  });

  it('reports the outsider before the status', () => {
    // A stranger must never learn from the answer whether the row is
    // pending or accepted.
    expect(
      acceptRequest(friendship(FriendshipStatus.ACCEPTED), STRANGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_A_PARTICIPANT' });
  });
});

describe('removeFriendship', () => {
  it('reads a pending removal by the addressee as a rejection', () => {
    expect(
      removeFriendship(friendship(FriendshipStatus.PENDING), ADDRESSEE),
    ).toEqual({ allowed: true, transition: 'REJECT' });
  });

  it('reads a pending removal by the requester as a cancellation', () => {
    expect(
      removeFriendship(friendship(FriendshipStatus.PENDING), REQUESTER),
    ).toEqual({ allowed: true, transition: 'CANCEL' });
  });

  it('lets either side drop an accepted friendship', () => {
    expect(
      removeFriendship(friendship(FriendshipStatus.ACCEPTED), REQUESTER),
    ).toEqual({ allowed: true, transition: 'REMOVE' });
    expect(
      removeFriendship(friendship(FriendshipStatus.ACCEPTED), ADDRESSEE),
    ).toEqual({ allowed: true, transition: 'REMOVE' });
  });

  it('does not let a stranger drop a friendship', () => {
    expect(
      removeFriendship(friendship(FriendshipStatus.ACCEPTED), STRANGER),
    ).toMatchObject({ allowed: false, reason: 'NOT_A_PARTICIPANT' });
  });
});

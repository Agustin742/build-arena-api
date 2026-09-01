import { FriendshipStatus } from '../../generated/prisma/enums';
import { isRanked, validateChallenge } from './battle-rules';

const CHALLENGER = '11111111-0000-4000-8000-000000000001';
const OPPONENT = '22222222-0000-4000-8000-000000000002';

describe('validateChallenge', () => {
  it('accepts a challenge towards another player', () => {
    expect(
      validateChallenge({
        challengerId: CHALLENGER,
        opponentId: OPPONENT,
      }),
    ).toEqual([]);
  });

  it('rejects challenging yourself', () => {
    expect(
      validateChallenge({
        challengerId: CHALLENGER,
        opponentId: CHALLENGER,
      }).map((entry) => entry.rule),
    ).toEqual(['SELF_CHALLENGE']);
  });
});

describe('isRanked', () => {
  it('ranks a battle between two players with no friendship', () => {
    expect(isRanked(null)).toBe(true);
  });

  it('does not rank a battle between accepted friends', () => {
    // Friends do not farm rating off each other.
    expect(isRanked({ status: FriendshipStatus.ACCEPTED })).toBe(false);
  });

  it('still ranks a battle when the friend request is only pending', () => {
    // A request nobody answered is not a friendship, and must not become a
    // way to opt a battle out of the ranking.
    expect(isRanked({ status: FriendshipStatus.PENDING })).toBe(true);
  });
});

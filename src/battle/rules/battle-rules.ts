import { FriendshipStatus } from '../../generated/prisma/enums';
import type { BattlePair } from './battle-transitions';

export type BattleRule = 'SELF_CHALLENGE';

export type BattleRuleViolation = {
  rule: BattleRule;
  message: string;
};

/**
 * Whether a challenge may be opened at all. An empty list means it may.
 * Whether the challenger actually owns the build they picked is not a rule:
 * that lookup is scoped to the caller, so a build that is not theirs is never
 * found in the first place.
 */
export function validateChallenge(draft: BattlePair): BattleRuleViolation[] {
  if (draft.challengerId === draft.opponentId) {
    return [
      {
        rule: 'SELF_CHALLENGE',
        message: 'You cannot challenge yourself',
      },
    ];
  }

  return [];
}

/**
 * Friends do not farm rating off each other, so a battle between two accepted
 * friends is unranked. A request nobody answered is not a friendship: taking
 * PENDING as one would turn "send a request and never wait" into a way to opt
 * any battle out of the ranking.
 */
export function isRanked(
  friendship: { status: FriendshipStatus } | null,
): boolean {
  return friendship?.status !== FriendshipStatus.ACCEPTED;
}

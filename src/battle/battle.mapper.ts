import type { PublicPlayer } from '../common/public-player';
import type { Battle } from '../generated/prisma/client';
import type { BattleStatus } from '../generated/prisma/enums';

export type BattleWithPlayers = Battle & {
  challenger: PublicPlayer;
  opponent: PublicPlayer;
};

export type PublicBattle = {
  id: string;
  status: BattleStatus;
  ranked: boolean;
  role: 'CHALLENGER' | 'OPPONENT';
  rival: PublicPlayer;
  outcome: 'WON' | 'LOST' | null;
  currentRound: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
};

const outcomeFor = (
  battle: BattleWithPlayers,
  viewerId: string,
): PublicBattle['outcome'] => {
  if (!battle.winnerId) {
    return null;
  }

  return battle.winnerId === viewerId ? 'WON' : 'LOST';
};

/**
 * A battle is one row, but each side sees a different thing in it: their own
 * role, the rival, and whether they won. Rendering against the viewer keeps
 * the participant ids, the winner id and the frozen build reference off the
 * wire; none of them tell a player anything they cannot already read here.
 */
export function toPublicBattle(
  battle: BattleWithPlayers,
  viewerId: string,
): PublicBattle {
  const isChallenger = battle.challengerId === viewerId;

  return {
    id: battle.id,
    status: battle.status,
    ranked: battle.ranked,
    role: isChallenger ? 'CHALLENGER' : 'OPPONENT',
    rival: isChallenger ? battle.opponent : battle.challenger,
    outcome: outcomeFor(battle, viewerId),
    currentRound: battle.currentRound,
    createdAt: battle.createdAt,
    startedAt: battle.startedAt,
    endedAt: battle.endedAt,
  };
}

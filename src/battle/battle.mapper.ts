import type { PublicPlayer } from '../common/public-player';
import type {
  ActiveCondition,
  Battle,
  BattleCombatant,
  BattleTurn,
} from '../generated/prisma/client';
import type { BattleStatus } from '../generated/prisma/enums';

export type BattleWithPlayers = Battle & {
  challenger: PublicPlayer;
  opponent: PublicPlayer;
};

/**
 * The full row the WebSocket session reads: the battle, both combatants with
 * their active conditions, and the turn history ordered `round, sequence`.
 * `findForParticipant` returns this shape (or `null`), never an HTTP
 * exception, so the socket layer stays free of REST's error vocabulary.
 */
export type BattleSessionRow = BattleWithPlayers & {
  combatants: (BattleCombatant & { conditions: ActiveCondition[] })[];
  turns: BattleTurn[];
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

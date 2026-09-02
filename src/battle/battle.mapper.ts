import type { PublicPlayer } from '../common/public-player';
import type {
  ActiveCondition,
  Battle,
  BattleCombatant,
  BattleTurn,
} from '../generated/prisma/client';
import type { BattleStatus, SkillType } from '../generated/prisma/enums';

export type BattleWithPlayers = Battle & {
  challenger: PublicPlayer;
  opponent: PublicPlayer;
};

/**
 * The frozen kit, as every read of a combatant asks for it. Declared once
 * here beside the row it belongs to, so `BattleService` and
 * `TurnResolutionService` cannot drift into asking for different columns.
 * Only `code` and `type`: the catalog is seeded and read-only, so the rest
 * of a skill is the client's to look up once through `GET /skills`.
 */
export const FROZEN_KIT = {
  select: { skill: { select: { code: true, type: true } } },
} as const;

/** One skill of a combatant's frozen kit, as `FROZEN_KIT` reads it. */
export type FrozenKitEntry = {
  skill: { code: string; type: SkillType };
};

/**
 * The full row the WebSocket session reads: the battle, both combatants with
 * their active conditions, and the turn history ordered `round, sequence`.
 * `findForParticipant` returns this shape (or `null`), never an HTTP
 * exception, so the socket layer stays free of REST's error vocabulary.
 */
export type BattleSessionRow = BattleWithPlayers & {
  combatants: (BattleCombatant & {
    conditions: ActiveCondition[];
    skills: FrozenKitEntry[];
  })[];
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

import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { CombatEvent } from '../combat';
import type { BattleStatus, SkillType } from '../generated/prisma/enums';

/**
 * Event names, error codes, and connection-scoped payload types shared by
 * the gateway and its middleware. Extended slice by slice — a later slice
 * never edits an earlier slice's export, per the `src/combat` convention.
 */

export const ClientEvent = {
  JOIN: 'battle:join',
  ACTION: 'battle:action',
  REACTION: 'battle:reaction',
} as const;

export const ServerEvent = {
  STATE: 'battle:state',
  ROUND_START: 'battle:round_start',
  REACTION_WINDOW: 'battle:reaction_window',
  TURN_RESOLVED: 'battle:turn_resolved',
  ENDED: 'battle:ended',
  OPPONENT_LEFT: 'battle:opponent_left',
  ERROR: 'battle:error',
} as const;

export type WsErrorCode =
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'WRONG_STATUS'
  | 'NOT_YOUR_TURN'
  | 'ALREADY_DECLARED'
  | 'NO_OPEN_WINDOW'
  | 'SKILL_NOT_IN_KIT'
  | 'WRONG_SKILL_TYPE'
  | 'REACTION_UNAVAILABLE'
  | 'TURN_ALREADY_RECORDED';

export type WsErrorPayload = {
  code: WsErrorCode;
  message: string;
  event?: string;
};

/**
 * Attached to `socket.data` by the handshake middleware. Imported
 * type-only from `src/auth`, so the socket identity is the same shape REST
 * uses without `src/ws` gaining a runtime dependency on `AuthModule`.
 */
export type SocketData = {
  user: AuthenticatedUser;
  // Set once `battle:join` admits the socket to a room, so `handleDisconnect`
  // knows which battle to record the drop against — Socket.IO has already
  // left every room by the time `disconnect` fires.
  battleId?: string;
};

/** Server → client: `battle:opponent_left`. */
export type BattleOpponentLeftPayload = { battleId: string } & LeftView;

/** Client → server: `battle:join`. */
export type BattleJoinPayload = {
  battleId: string;
};

/** Client → server: `battle:action`. */
export type BattleActionPayload = {
  battleId: string;
  skillCode: string;
};

/**
 * Client → server: `battle:reaction`. `skillCode: null` is an explicit
 * decline — it resolves the window immediately and preserves the reaction,
 * exactly as expiry does (design's Event Contract).
 */
export type BattleReactionPayload = {
  battleId: string;
  skillCode: string | null;
};

/**
 * One combatant as the design's Event Contract renders it — shared,
 * byte-for-byte, by `battle:state` and `battle:turn_resolved`, declared
 * once here per the `src/combat` convention.
 */
export type CombatantView = {
  userId: string;
  combatantId: string;
  strength: number;
  magic: number;
  dexterity: number;
  constitution: number;
  armorClass: number;
  maxHp: number;
  currentHp: number;
  initiative: number;
  reactionAvailable: boolean;
  conditions: { type: string; roundsRemaining: number }[];
};

/** One persisted `BattleTurn` row, rendered for the wire. */
export type TurnView = {
  round: number;
  sequence: number;
  actorId: string;
  kind: SkillType;
  skillCode: string | null;
  attackRoll: number | null;
  attackTotal: number | null;
  targetValue: number | null;
  hit: boolean | null;
  critical: boolean;
  damage: number;
};

/** The open-window shape shared by `battle:reaction_window` and `battle:state`. */
export type WindowView = {
  round: number;
  actorUserId: string;
  actionSkillCode: string;
  deadline: string;
  remainingMs: number;
  applicableSkillCodes: string[];
};

/** The disconnect shape shared by `battle:opponent_left` and `battle:state`. */
export type LeftView = {
  userId: string;
  deadline: string;
};

/**
 * Server → client: `battle:state`. The full reconnect payload (design's
 * sequence diagram 3): both frozen stat blocks, the resolved turn history in
 * order, an open reaction window's remaining time when one exists, and
 * whether the opponent is mid-disconnect.
 */
export type BattleStatePayload = {
  battleId: string;
  status: BattleStatus;
  currentRound: number;
  activeUserId: string | null;
  combatants: CombatantView[];
  turns: TurnView[];
  openWindow: WindowView | null;
  opponentLeft: LeftView | null;
};

/** Server → client: `battle:reaction_window`. */
export type BattleReactionWindowPayload = { battleId: string } & WindowView;

/** Server → client: `battle:turn_resolved`. */
export type BattleTurnResolvedPayload = {
  battleId: string;
  round: number;
  turns: TurnView[];
  events: readonly CombatEvent[];
  combatants: CombatantView[];
  defeatedId: string | null;
};

/**
 * Server → client: `battle:ended`. No rating delta field until Phase 7 —
 * the field is absent, not null (design's Event Contract).
 */
/** One player's rating movement, as `battle:ended` renders it. */
export type RatingChangeView = {
  userId: string;
  before: number;
  change: number;
  after: number;
};

export type BattleEndedPayload = {
  battleId: string;
  winnerId: string;
  reason: 'DEFEAT' | 'ABANDONMENT';
  endedAt: string;
  // Always present, always both players. An unranked duel (two friends,
  // overview §2.8) reports real ratings and a change of 0 rather than
  // dropping the field: a client must never have to read absence.
  ranked: boolean;
  ratingChanges: RatingChangeView[];
};

/** Server → client: `battle:round_start`. */
export type BattleRoundStartPayload = {
  battleId: string;
  round: number;
  activeUserId: string;
  events: readonly CombatEvent[];
};

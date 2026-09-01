import { BattleStatus } from '../../generated/prisma/enums';

/** The two sides of a battle, in the order the row stores them. */
export type BattlePair = {
  challengerId: string;
  opponentId: string;
};

export type StoredBattle = BattlePair & {
  status: BattleStatus;
};

export type BattleTransition = 'ACCEPT' | 'REJECT' | 'CANCEL' | 'START';

/** Which side of the battle is allowed to make a move. */
export type Entitled = 'CHALLENGER' | 'OPPONENT' | 'EITHER';

export type TransitionRule = {
  from: BattleStatus;
  to: BattleStatus;
  entitled: Entitled;
};

/**
 * Why a transition was refused. `NOT_A_PARTICIPANT` is the only reason that
 * must not tell the caller anything about the battle, so the service answers
 * it with a 404 and the other two with a 403.
 */
export type TransitionDenialReason =
  'NOT_A_PARTICIPANT' | 'WRONG_STATUS' | 'NOT_ENTITLED';

export type TransitionOutcome =
  | { allowed: true; to: BattleStatus }
  | { allowed: false; reason: TransitionDenialReason; message: string };

/**
 * The state machine of a battle, exactly as the design tabulates it (§8.2).
 * Every row carries TWO conditions, and that is the whole point: `from` says
 * the move is possible, `entitled` says who may make it. A machine with only
 * the first column lets the challenger accept their own challenge.
 */
export const BATTLE_TRANSITIONS: Record<BattleTransition, TransitionRule> = {
  ACCEPT: {
    from: BattleStatus.PENDING,
    to: BattleStatus.ACCEPTED,
    entitled: 'OPPONENT',
  },
  REJECT: {
    from: BattleStatus.PENDING,
    to: BattleStatus.REJECTED,
    entitled: 'OPPONENT',
  },
  CANCEL: {
    from: BattleStatus.PENDING,
    to: BattleStatus.CANCELLED,
    entitled: 'CHALLENGER',
  },
  START: {
    from: BattleStatus.ACCEPTED,
    to: BattleStatus.IN_PROGRESS,
    entitled: 'EITHER',
  },
};

const SIDE_OF: Record<
  Exclude<Entitled, 'EITHER'>,
  (battle: StoredBattle) => string
> = {
  CHALLENGER: (battle) => battle.challengerId,
  OPPONENT: (battle) => battle.opponentId,
};

const ROLE_NAME: Record<Entitled, string> = {
  CHALLENGER: 'the challenger',
  OPPONENT: 'the challenged player',
  EITHER: 'a participant',
};

const isParticipant = (battle: StoredBattle, actorId: string): boolean =>
  battle.challengerId === actorId || battle.opponentId === actorId;

const isEntitled = (
  rule: TransitionRule,
  battle: StoredBattle,
  actorId: string,
): boolean =>
  rule.entitled === 'EITHER' || SIDE_OF[rule.entitled](battle) === actorId;

/**
 * Whether `actorId` may move `battle` through `transition`, and what status it
 * lands on. Pure: no NestJS, no Prisma, no clock. The service turns a refusal
 * into the right status code.
 */
/** Why the server closed a battle. Not a player move, so there is no `entitled` side. */
export type ClosureReason = 'DEFEAT' | 'ABANDONMENT';

/**
 * The one SERVER-DECIDED edge of the machine. It lives in this file because
 * there must be exactly one place that answers "what statuses can a battle
 * reach". It is a SEPARATE constant because `entitled` answers "which player
 * may make this move", and here nobody moves: the engine reported a defeat,
 * or a deadline passed.
 */
export const BATTLE_CLOSURE = {
  from: BattleStatus.IN_PROGRESS,
  to: BattleStatus.FINISHED,
} as const;

export type ClosureOutcome =
  | { allowed: true; to: BattleStatus; winnerId: string; reason: ClosureReason }
  | { allowed: false; reason: 'WRONG_STATUS'; message: string };

/**
 * Closes an in-progress battle, server-side. There is no entitlement check —
 * a defeat or an abandonment deadline is decided by the engine or the clock,
 * never by a player asking. Refuses any battle not currently `IN_PROGRESS`.
 */
export function closeBattle(
  battle: StoredBattle,
  winnerId: string,
  reason: ClosureReason,
): ClosureOutcome {
  if (battle.status !== BATTLE_CLOSURE.from) {
    return {
      allowed: false,
      reason: 'WRONG_STATUS',
      message: `A battle can only be closed while it is ${BATTLE_CLOSURE.from.toLowerCase()}, and this one is ${battle.status.toLowerCase()}`,
    };
  }

  return { allowed: true, to: BATTLE_CLOSURE.to, winnerId, reason };
}

export function applyTransition(
  transition: BattleTransition,
  battle: StoredBattle,
  actorId: string,
): TransitionOutcome {
  if (!isParticipant(battle, actorId)) {
    return {
      allowed: false,
      reason: 'NOT_A_PARTICIPANT',
      message: 'The battle does not exist, or you are not in it',
    };
  }

  const rule = BATTLE_TRANSITIONS[transition];

  if (battle.status !== rule.from) {
    return {
      allowed: false,
      reason: 'WRONG_STATUS',
      message: `A battle can only be ${rule.to.toLowerCase()} while it is ${rule.from.toLowerCase()}, and this one is ${battle.status.toLowerCase()}`,
    };
  }

  if (!isEntitled(rule, battle, actorId)) {
    return {
      allowed: false,
      reason: 'NOT_ENTITLED',
      message: `Only ${ROLE_NAME[rule.entitled]} can do that`,
    };
  }

  return { allowed: true, to: rule.to };
}

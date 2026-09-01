import { BattleStatus, SkillType } from '../../generated/prisma/enums';
import type { WsErrorCode } from '../battle-events';

/**
 * The three kinds of message the socket accepts. `JOIN` carries V1/V2 too —
 * the design's point is there is no separate, lighter check for room entry.
 */
export type MessageIntent = 'JOIN' | 'ACTION' | 'REACTION';

/** One skill in a combatant's frozen kit: only what V4/V5 need to decide. */
export type KitEntry = {
  readonly code: string;
  readonly type: SkillType;
};

/**
 * The sender's side of the battle. `null` only when V1 has not yet confirmed
 * the sender is a participant, so nothing after V1 may read it in anger.
 */
export type ActorView = {
  readonly reactionAvailable: boolean;
  readonly kit: readonly KitEntry[];
} | null;

/**
 * Everything the seven checks need, read fresh from the database by the
 * caller on every message and never carried across messages — that is what
 * makes room membership structurally incapable of standing in for this read.
 */
export type SessionContext = {
  readonly intent: MessageIntent;
  readonly actorId: string;
  readonly declaredSkillCode: string | null;
  readonly isParticipant: boolean;
  readonly status: BattleStatus;
  readonly activeUserId: string | null;
  readonly reactionWindowOpen: boolean;
  readonly actor: ActorView;
  readonly slotOccupied: boolean;
};

export type WsDenial = {
  readonly code: WsErrorCode;
  readonly message: string;
};

type Check = {
  readonly id: 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7';
  readonly appliesTo: readonly MessageIntent[];
  readonly run: (ctx: SessionContext) => WsDenial | null;
};

/**
 * Byte-for-byte the message REST's `NotFoundException` uses for the same
 * case — a stranger must never learn from the answer that the battle exists.
 */
const NOT_FOUND: WsDenial = { code: 'NOT_FOUND', message: 'Battle not found' };

const JOIN_STATUSES: readonly BattleStatus[] = [
  BattleStatus.ACCEPTED,
  BattleStatus.IN_PROGRESS,
];

const kitEntryFor = (ctx: SessionContext): KitEntry | null =>
  ctx.actor?.kit.find((entry) => entry.code === ctx.declaredSkillCode) ?? null;

/**
 * The seven validations of `docs/design/overview.md` §7, in order, declared
 * exactly once. `appliesTo` is data, not control flow: a handler cannot
 * select a check, and adding an intent cannot silently skip one.
 */
export const CHECKS: readonly Check[] = [
  {
    id: 'V1',
    appliesTo: ['JOIN', 'ACTION', 'REACTION'],
    run: (ctx) => (ctx.isParticipant ? null : NOT_FOUND),
  },
  {
    id: 'V2',
    // JOIN alone accepts ACCEPTED: joining an accepted battle is what fires
    // the START transition. Every other message needs the fight running.
    appliesTo: ['JOIN', 'ACTION', 'REACTION'],
    run: (ctx) => {
      const allowed =
        ctx.intent === 'JOIN' ? JOIN_STATUSES : [BattleStatus.IN_PROGRESS];

      if (allowed.includes(ctx.status)) {
        return null;
      }

      return {
        code: 'WRONG_STATUS',
        message: `The battle must be ${allowed
          .map((status) => status.toLowerCase())
          .join(' or ')} for that, and this one is ${ctx.status.toLowerCase()}`,
      };
    },
  },
  {
    id: 'V3',
    appliesTo: ['ACTION', 'REACTION'],
    run: (ctx) => {
      if (ctx.intent === 'ACTION') {
        if (ctx.actorId !== ctx.activeUserId) {
          return { code: 'NOT_YOUR_TURN', message: 'It is not your turn' };
        }

        // The active player's own action already opened a window — a second
        // one is a resend, not a new turn.
        if (ctx.reactionWindowOpen) {
          return {
            code: 'ALREADY_DECLARED',
            message: 'You already declared your action for this round',
          };
        }

        return null;
      }

      // REACTION: only the non-active participant may answer an open
      // window. No window, or the active player answering their own, are
      // both "nothing here for you to react to".
      if (!ctx.reactionWindowOpen || ctx.actorId === ctx.activeUserId) {
        return {
          code: 'NO_OPEN_WINDOW',
          message: 'There is no reaction window open for you to answer',
        };
      }

      return null;
    },
  },
  {
    id: 'V4',
    appliesTo: ['ACTION', 'REACTION'],
    // `skillCode: null` on a reaction is an explicit decline (Event
    // Contract) — there is no skill to check membership of.
    run: (ctx) => {
      if (ctx.declaredSkillCode === null) {
        return null;
      }

      return kitEntryFor(ctx)
        ? null
        : {
            code: 'SKILL_NOT_IN_KIT',
            message: 'That skill is not part of your kit for this battle',
          };
    },
  },
  {
    id: 'V5',
    appliesTo: ['ACTION', 'REACTION'],
    run: (ctx) => {
      if (ctx.declaredSkillCode === null) {
        return null;
      }

      const entry = kitEntryFor(ctx);
      // V4 already refuses a skill missing from the kit entirely.
      if (!entry) {
        return null;
      }

      const expected =
        ctx.intent === 'ACTION' ? SkillType.ACTION : SkillType.REACTION;

      if (entry.type === expected) {
        return null;
      }

      const article = entry.type === SkillType.ACTION ? 'An' : 'A';

      return {
        code: 'WRONG_SKILL_TYPE',
        message: `${article} ${entry.type.toLowerCase()} skill cannot be declared as ${
          ctx.intent === 'ACTION' ? 'an action' : 'a reaction'
        }`,
      };
    },
  },
  {
    id: 'V6',
    appliesTo: ['REACTION'],
    // A decline spends nothing (design's Event Contract), so it is exempt
    // exactly like V4/V5 — there is no reaction being cashed in.
    run: (ctx) => {
      if (ctx.declaredSkillCode === null) {
        return null;
      }

      return ctx.actor?.reactionAvailable
        ? null
        : {
            code: 'REACTION_UNAVAILABLE',
            message: 'Your reaction is not available this round',
          };
    },
  },
  {
    id: 'V7',
    appliesTo: ['ACTION', 'REACTION'],
    run: (ctx) =>
      ctx.slotOccupied
        ? {
            code: 'TURN_ALREADY_RECORDED',
            message: 'A turn is already recorded for this slot',
          }
        : null,
  },
];

/**
 * One entry point: loops `CHECKS` in order and returns the first denial, or
 * `null` once every applicable check has passed. Handlers never name a check.
 */
export const authorize = (
  intent: MessageIntent,
  ctx: SessionContext,
): WsDenial | null => {
  for (const check of CHECKS) {
    if (!check.appliesTo.includes(intent)) {
      continue;
    }

    const denial = check.run(ctx);
    if (denial) {
      return denial;
    }
  }

  return null;
};

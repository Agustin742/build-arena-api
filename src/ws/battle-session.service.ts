import { Injectable } from '@nestjs/common';

import type { BattleSessionRow } from '../battle/battle.mapper';
import { BattleService } from '../battle/battle.service';
import { applyTransition } from '../battle/rules';
import { actionResolutionOf, isApplicable, REACTION_TABLE } from '../combat';
import { BattleStatus, SkillType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BattleReactionWindowPayload,
  CombatantView,
  BattleStatePayload,
} from './battle-events';
import type {
  KitEntry,
  MessageIntent,
  SessionContext,
  WsDenial,
} from './rules/message-checks';
import { authorize } from './rules/message-checks';

export type AdmitJoinResult =
  | { readonly ok: true; readonly row: BattleSessionRow }
  | { readonly ok: false; readonly denial: WsDenial };

export type MessageAdmitResult = AdmitJoinResult;

/** `battle:reaction_window`'s deadline: 15 seconds from declaration (Event Contract). */
const REACTION_WINDOW_MS = 15_000;

/** A `JOIN` context needs only what V1/V2 read — every other field is inert. */
const joinContext = (
  actorId: string,
  row: BattleSessionRow | null,
): SessionContext => ({
  intent: 'JOIN',
  actorId,
  declaredSkillCode: null,
  isParticipant: row !== null,
  status: row?.status ?? BattleStatus.PENDING,
  activeUserId: row?.activeUserId ?? null,
  reactionWindowOpen: false,
  actor: null,
  slotOccupied: false,
});

/**
 * The `ACTION`/`REACTION` context V1-V7 need: the declared skill, the
 * sender's kit and reaction availability, whether a window is open, and
 * whether this round/sequence slot is already recorded. Built fresh from
 * `row`, never carried across messages — same discipline as `joinContext`.
 */
const messageContext = async (
  intent: 'ACTION' | 'REACTION',
  actorId: string,
  declaredSkillCode: string | null,
  row: BattleSessionRow | null,
  kitFor: (buildId: string | null) => Promise<readonly KitEntry[]>,
): Promise<SessionContext> => {
  if (!row) {
    return {
      intent,
      actorId,
      declaredSkillCode,
      isParticipant: false,
      status: BattleStatus.PENDING,
      activeUserId: null,
      reactionWindowOpen: false,
      actor: null,
      slotOccupied: false,
    };
  }

  const actorCombatant = row.combatants.find((c) => c.userId === actorId);
  const kit = actorCombatant ? await kitFor(actorCombatant.buildId) : [];
  const sequence = intent === 'ACTION' ? 1 : 2;

  return {
    intent,
    actorId,
    declaredSkillCode,
    isParticipant: true,
    status: row.status,
    activeUserId: row.activeUserId,
    reactionWindowOpen: row.reactionDeadline !== null,
    actor: actorCombatant
      ? { reactionAvailable: actorCombatant.reactionAvailable, kit }
      : null,
    slotOccupied: row.turns.some(
      (turn) => turn.round === row.currentRound && turn.sequence === sequence,
    ),
  };
};

/**
 * The higher `initiative` acts first; a tie breaks to the challenger,
 * deterministically (design's "Round advancement").
 */
const initiativeWinner = (row: BattleSessionRow): string => {
  const challenger = row.combatants.find((c) => c.userId === row.challengerId);
  const opponent = row.combatants.find((c) => c.userId === row.opponentId);

  return (opponent?.initiative ?? 0) > (challenger?.initiative ?? 0)
    ? row.opponentId
    : row.challengerId;
};

/**
 * The participant-scoped read, the message-authorization entry point, and
 * (for this slice) the limited `battle:state` assembly. `settleOverdue()`
 * and the full-history assembly arrive in slice 7.
 */
@Injectable()
export class BattleSessionService {
  constructor(
    private readonly battleService: BattleService,
    private readonly prisma: PrismaService,
  ) {}

  /** The participant-scoped read `findForParticipant` already provides. */
  load(battleId: string, userId: string): Promise<BattleSessionRow | null> {
    return this.battleService.findForParticipant(battleId, userId);
  }

  /** Thin delegate: the seven checks are declared exactly once, in `rules/`. */
  authorizeMessage(
    intent: MessageIntent,
    ctx: SessionContext,
  ): WsDenial | null {
    return authorize(intent, ctx);
  }

  /**
   * Loads the battle, authorizes the join (V1/V2 only), and — the point of
   * `battle:join` — fires the shared `START` transition when an accepted
   * battle's first participant arrives. A stranger and a battle that never
   * existed both fail `load()` the same way, so they reach `authorizeMessage`
   * with an identical, byte-for-byte-refusing context.
   */
  async admitJoin(battleId: string, actorId: string): Promise<AdmitJoinResult> {
    const row = await this.load(battleId, actorId);
    const denial = this.authorizeMessage('JOIN', joinContext(actorId, row));

    if (denial) {
      return { ok: false, denial };
    }

    // `authorizeMessage` already refused a `null` row, so `row` is not null
    // by the time we get here.
    const admitted = row as BattleSessionRow;

    if (admitted.status !== BattleStatus.ACCEPTED) {
      return { ok: true, row: admitted };
    }

    const outcome = applyTransition('START', admitted, actorId);

    if (!outcome.allowed) {
      // Unreachable: V1/V2 already confirmed participation and status.
      return { ok: true, row: admitted };
    }

    const activeUserId = initiativeWinner(admitted);
    const startedAt = new Date();

    await this.prisma.battle.update({
      where: { id: battleId },
      data: {
        status: outcome.to,
        currentRound: 1,
        activeUserId,
        startedAt,
      },
    });

    return {
      ok: true,
      row: {
        ...admitted,
        status: outcome.to,
        currentRound: 1,
        activeUserId,
        startedAt,
      },
    };
  }

  /** One combatant's kit, read fresh: `Build -> BuildSkill -> Skill`. */
  private async kitFor(buildId: string | null): Promise<readonly KitEntry[]> {
    if (!buildId) {
      return [];
    }

    const entries = await this.prisma.buildSkill.findMany({
      where: { buildId },
      include: { skill: true },
    });

    return entries.map((entry) => ({
      code: entry.skill.code,
      type: entry.skill.type,
    }));
  }

  /** Shared by `admitAction`/`admitReaction`: load, build context, authorize. */
  private async admit(
    intent: 'ACTION' | 'REACTION',
    battleId: string,
    actorId: string,
    skillCode: string | null,
  ): Promise<MessageAdmitResult> {
    const row = await this.load(battleId, actorId);
    const ctx = await messageContext(
      intent,
      actorId,
      skillCode,
      row,
      (buildId) => this.kitFor(buildId),
    );
    const denial = this.authorizeMessage(intent, ctx);

    if (denial) {
      return { ok: false, denial };
    }

    // `authorizeMessage` already refused a `null` row (V1), so `row` is not
    // null by the time we get here.
    return { ok: true, row: row as BattleSessionRow };
  }

  /** `battle:action`: V1-V5 and V7 (V6 does not apply to a declared action). */
  admitAction(
    battleId: string,
    actorId: string,
    skillCode: string,
  ): Promise<MessageAdmitResult> {
    return this.admit('ACTION', battleId, actorId, skillCode);
  }

  /** `battle:reaction`: the full seven, including V6's `reactionAvailable`. */
  admitReaction(
    battleId: string,
    actorId: string,
    skillCode: string | null,
  ): Promise<MessageAdmitResult> {
    return this.admit('REACTION', battleId, actorId, skillCode);
  }

  /**
   * Persists the declared action and opens the reaction window (design's
   * sequence diagram 1, `G->>DB: UPDATE Battle SET pendingActionSkillCode,
   * reactionDeadline = now + 15s`). `applicableSkillCodes` is informational
   * only — `battle:reaction` re-validates through `authorize()` regardless
   * of what the client was shown.
   */
  async declareAction(
    row: BattleSessionRow,
    skillCode: string,
  ): Promise<BattleReactionWindowPayload> {
    const actorUserId = row.activeUserId;

    if (actorUserId === null) {
      // Unreachable: V2/V3 already guarantee an IN_PROGRESS battle with an
      // active player whenever a `battle:action` reaches this point.
      throw new Error(`Battle ${row.id} has no active player`);
    }

    const deadline = new Date(Date.now() + REACTION_WINDOW_MS);

    await this.prisma.battle.update({
      where: { id: row.id },
      data: { pendingActionSkillCode: skillCode, reactionDeadline: deadline },
    });

    const defender = row.combatants.find((c) => c.userId !== actorUserId);
    const applicableSkillCodes = defender
      ? await this.applicableReactionSkillCodes(skillCode, defender.buildId)
      : [];

    return {
      battleId: row.id,
      round: row.currentRound,
      actorUserId,
      actionSkillCode: skillCode,
      deadline: deadline.toISOString(),
      remainingMs: REACTION_WINDOW_MS,
      applicableSkillCodes,
    };
  }

  /**
   * The defender's `REACTION`-type kit, filtered to what actually answers
   * the declared action — `REACTION_TABLE` and `isApplicable` are the
   * engine's own, reused as-is (design's Event Contract).
   */
  private async applicableReactionSkillCodes(
    actionSkillCode: string,
    defenderBuildId: string | null,
  ): Promise<string[]> {
    const [actionSkill, kit] = await Promise.all([
      this.prisma.skill.findUniqueOrThrow({ where: { code: actionSkillCode } }),
      this.kitFor(defenderBuildId),
    ]);

    const resolution = actionResolutionOf(actionSkill);

    return kit
      .filter((entry) => entry.type === SkillType.REACTION)
      .filter((entry) => {
        const behavior = REACTION_TABLE[entry.code];
        return behavior !== undefined && isApplicable(behavior, resolution);
      })
      .map((entry) => entry.code);
  }

  /**
   * Today's `battle:state`: status, round, active player, and combatants.
   * `turns`, `openWindow` and `opponentLeft` join this in slice 7.
   */
  toStatePayload(row: BattleSessionRow): BattleStatePayload {
    return {
      battleId: row.id,
      status: row.status,
      currentRound: row.currentRound,
      activeUserId: row.activeUserId,
      combatants: row.combatants.map(toCombatantView),
    };
  }
}

const toCombatantView = (
  combatant: BattleSessionRow['combatants'][number],
): CombatantView => ({
  userId: combatant.userId,
  combatantId: combatant.id,
  strength: combatant.strength,
  magic: combatant.magic,
  dexterity: combatant.dexterity,
  constitution: combatant.constitution,
  armorClass: combatant.armorClass,
  maxHp: combatant.maxHp,
  currentHp: combatant.currentHp,
  initiative: combatant.initiative,
  reactionAvailable: combatant.reactionAvailable,
  conditions: combatant.conditions.map((condition) => ({
    type: condition.type,
    roundsRemaining: condition.roundsRemaining,
  })),
});

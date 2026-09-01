import { Injectable } from '@nestjs/common';

import type { BattleSessionRow } from '../battle/battle.mapper';
import { BattleService } from '../battle/battle.service';
import { applyTransition } from '../battle/rules';
import { BattleStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { BattleStateCombatant, BattleStatePayload } from './battle-events';
import type {
  MessageIntent,
  SessionContext,
  WsDenial,
} from './rules/message-checks';
import { authorize } from './rules/message-checks';

export type AdmitJoinResult =
  | { readonly ok: true; readonly row: BattleSessionRow }
  | { readonly ok: false; readonly denial: WsDenial };

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
): BattleStateCombatant => ({
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

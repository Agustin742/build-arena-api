import { Inject, Injectable } from '@nestjs/common';

import type {
  CombatEvent,
  Combatant,
  DeclaredAction,
  DeclaredReaction,
  RandomSource,
  TurnRecord,
} from '../combat';
import { closeBattle } from '../battle/rules';
import { RANDOM_SOURCE } from '../common/random-source.token';
import { resolveTurn, startRound as engineStartRound } from '../combat';
import type {
  BattleCombatant,
  ActiveCondition,
} from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const UNIQUE_VIOLATION = 'P2002'; // beside the existing FOREIGN_KEY_VIOLATION = 'P2003'

/** Everything a resolved round needs to render `battle:turn_resolved`. */
export type TurnResolutionOutcome = {
  readonly battleId: string;
  readonly round: number;
  readonly turns: readonly TurnRecord[];
  readonly actor: Combatant;
  readonly defender: Combatant;
  // Empty on a re-emit: events are never persisted, so a re-read has none
  // to reconstruct — only the turns and combatant state are the contract.
  readonly events: readonly CombatEvent[];
  readonly defeatedId: string | null;
  // Both null unless `defeatedId` is set — `closeBattle`'s own result on a
  // fresh resolve, or the persisted columns on a re-emit; never re-derived.
  readonly winnerId: string | null;
  readonly endedAt: Date | null;
};

/** `startRound`'s result, persisted and handed back to the caller for `battle:round_start`. */
export type RoundStartOutcome = {
  readonly actor: Combatant;
  readonly events: readonly CombatEvent[];
};

/**
 * Signals "the claim lost" out of the transaction so it can be caught
 * beside `P2002` and routed to the same idempotent re-read — the claim
 * losing and the unique backstop firing are the same outcome from the
 * caller's point of view (design's "Transaction Boundaries").
 */
class ClaimLostError extends Error {}

type CombatantWithConditions = BattleCombatant & {
  conditions: ActiveCondition[];
};

const toCombatant = (row: CombatantWithConditions): Combatant => ({
  id: row.id,
  userId: row.userId,
  strength: row.strength,
  magic: row.magic,
  dexterity: row.dexterity,
  constitution: row.constitution,
  armorClass: row.armorClass,
  maxHp: row.maxHp,
  currentHp: row.currentHp,
  initiative: row.initiative,
  reactionAvailable: row.reactionAvailable,
  conditions: row.conditions.map((condition) => ({
    type: condition.type,
    roundsRemaining: condition.roundsRemaining,
  })),
});

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === UNIQUE_VIOLATION;

/**
 * The single transactional resolver (design's "One resolver, three
 * callers"): the reaction handler, the expiry timer, and the lazy check
 * all end up here. Never called twice for the same slot on purpose — the
 * claim and the `@@unique([battleId, round, sequence])` backstop make a
 * second call a no-op re-emit instead of a second resolution.
 */
@Injectable()
export class TurnResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RANDOM_SOURCE) private readonly random: RandomSource,
  ) {}

  /**
   * Resolves the declared action (and optional reaction) for `round`
   * through the combat engine, and persists the result atomically. A
   * second concurrent or retried call for the same slot never re-runs the
   * engine — it re-reads and re-emits what the winner already persisted.
   */
  async resolve(
    battleId: string,
    round: number,
    actionSkillCode: string,
    reactionSkillCode: string | null,
  ): Promise<TurnResolutionOutcome> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Statement 1 — the claim. Exactly one caller gets `count === 1`;
        // Postgres serializes the racer on the row lock and re-evaluates
        // this WHERE after the winner commits, so the loser matches zero
        // rows and never reaches the engine.
        const claim = await tx.battle.updateMany({
          where: {
            id: battleId,
            currentRound: round,
            reactionDeadline: { not: null },
          },
          data: { pendingActionSkillCode: null, reactionDeadline: null },
        });

        if (claim.count === 0) {
          throw new ClaimLostError();
        }

        const battle = await tx.battle.findUniqueOrThrow({
          where: { id: battleId },
          select: {
            activeUserId: true,
            status: true,
            challengerId: true,
            opponentId: true,
            combatants: { include: { conditions: true } },
          },
        });

        const actorRow = battle.combatants.find(
          (combatant) => combatant.userId === battle.activeUserId,
        );
        const defenderRow = battle.combatants.find(
          (combatant) => combatant.userId !== battle.activeUserId,
        );

        if (!actorRow || !defenderRow) {
          throw new Error(`Battle ${battleId} does not have two combatants`);
        }

        const actionSkill = await tx.skill.findUniqueOrThrow({
          where: { code: actionSkillCode },
        });
        const reactionSkill = reactionSkillCode
          ? await tx.skill.findUniqueOrThrow({
              where: { code: reactionSkillCode },
            })
          : null;

        const action: DeclaredAction = {
          actorId: actorRow.userId,
          skill: actionSkill,
        };
        const reaction: DeclaredReaction | null = reactionSkill
          ? { actorId: defenderRow.userId, skill: reactionSkill }
          : null;

        const resolution = resolveTurn({
          round,
          actor: toCombatant(actorRow),
          defender: toCombatant(defenderRow),
          action,
          reaction,
          random: this.random,
        });

        // Statement 4 — the hard backstop. No `skipDuplicates`: a
        // uniqueness violation here must roll back everything, not
        // silently drop the duplicate half of a turn.
        await tx.battleTurn.createMany({
          data: resolution.turns.map((turn) => ({
            battleId,
            round: turn.round,
            sequence: turn.sequence,
            actorId: turn.actorId,
            kind: turn.kind,
            skillCode: turn.skillCode,
            attackRoll: turn.attackRoll,
            attackTotal: turn.attackTotal,
            targetValue: turn.targetValue,
            hit: turn.hit,
            critical: turn.critical,
            damage: turn.damage,
          })),
        });

        await this.persistCombatants(
          tx,
          resolution.actor,
          resolution.defender,
          resolution.turns,
        );
        await this.persistConditions(tx, resolution.events);
        const advance = await this.persistBattleAdvance(
          tx,
          battleId,
          round,
          battle,
          resolution.actor,
          resolution.defender,
          resolution.defeatedId,
        );

        return {
          battleId,
          round,
          turns: resolution.turns,
          actor: resolution.actor,
          defender: resolution.defender,
          events: resolution.events,
          defeatedId: resolution.defeatedId,
          winnerId: advance.winnerId,
          endedAt: advance.endedAt,
        };
      });
    } catch (error) {
      if (error instanceof ClaimLostError || isUniqueViolation(error)) {
        return this.reReadResolution(battleId, round);
      }

      throw error;
    }
  }

  /**
   * Step 5. `currentHp` always matches what the engine returned. The
   * defender's `reactionAvailable` is the one rule the whole design turns
   * on (`resolveTurn` never writes it — it only reads it in `gateReaction`):
   * spent iff the reaction row actually carries a `skillCode`. Expiry, an
   * explicit decline, and `REACTION_IGNORED` all leave `turns[1].skillCode`
   * `null`, so all three fall out of this one check with no special case.
   */
  private async persistCombatants(
    tx: Prisma.TransactionClient,
    actor: Combatant,
    defender: Combatant,
    turns: readonly TurnRecord[],
  ): Promise<void> {
    const reactionSpent = turns.length > 1 && turns[1].skillCode !== null;

    await tx.battleCombatant.update({
      where: { id: actor.id },
      data: { currentHp: actor.currentHp },
    });

    await tx.battleCombatant.update({
      where: { id: defender.id },
      data: {
        currentHp: defender.currentHp,
        reactionAvailable: reactionSpent ? false : defender.reactionAvailable,
      },
    });
  }

  /** Step 6 — mirrors the round's condition events onto `ActiveCondition`. */
  private async persistConditions(
    tx: Prisma.TransactionClient,
    events: readonly CombatEvent[],
  ): Promise<void> {
    for (const event of events) {
      if (event.type === 'CONDITION_APPLIED') {
        await tx.activeCondition.upsert({
          where: {
            combatantId_type: {
              combatantId: event.combatantId,
              type: event.condition,
            },
          },
          create: {
            combatantId: event.combatantId,
            type: event.condition,
            roundsRemaining: event.rounds,
          },
          update: { roundsRemaining: event.rounds },
        });
      } else if (event.type === 'CONDITION_TICKED') {
        await tx.activeCondition.update({
          where: {
            combatantId_type: {
              combatantId: event.combatantId,
              type: event.condition,
            },
          },
          data: { roundsRemaining: event.roundsRemaining },
        });
      } else if (event.type === 'CONDITION_EXPIRED') {
        await tx.activeCondition.delete({
          where: {
            combatantId_type: {
              combatantId: event.combatantId,
              type: event.condition,
            },
          },
        });
      }
    }
  }

  /**
   * Step 7. The window columns were already cleared by the claim. A
   * defeat closes the battle server-side through `closeBattle`; otherwise
   * the round advances and play passes to the other combatant.
   */
  private async persistBattleAdvance(
    tx: Prisma.TransactionClient,
    battleId: string,
    round: number,
    battle: { status: string; challengerId: string; opponentId: string },
    actor: Combatant,
    defender: Combatant,
    defeatedId: string | null,
  ): Promise<{ winnerId: string | null; endedAt: Date | null }> {
    if (!defeatedId) {
      await tx.battle.update({
        where: { id: battleId },
        data: { currentRound: round + 1, activeUserId: defender.userId },
      });
      return { winnerId: null, endedAt: null };
    }

    const winner = defeatedId === actor.id ? defender : actor;
    const outcome = closeBattle(
      {
        status: battle.status as never,
        challengerId: battle.challengerId,
        opponentId: battle.opponentId,
      },
      winner.userId,
      'DEFEAT',
    );

    if (!outcome.allowed) {
      // Unreachable: the claim only ever wins while the battle is
      // IN_PROGRESS, which is exactly what `closeBattle` requires.
      throw new Error(`Cannot close battle ${battleId}: ${outcome.message}`);
    }

    const endedAt = new Date();

    await tx.battle.update({
      where: { id: battleId },
      data: { status: outcome.to, winnerId: outcome.winnerId, endedAt },
    });

    return { winnerId: outcome.winnerId, endedAt };
  }

  /**
   * The per-round tick (design's "Round advancement"): scoped to the
   * incoming actor only (Decision F). A separate, short transaction from
   * `resolve()`'s own — the sequence diagram calls this a distinct step,
   * after `battle:turn_resolved` has already gone out. Reuses
   * `persistConditions` as-is; nothing here re-derives condition logic.
   */
  async startRound(
    round: number,
    actor: Combatant,
  ): Promise<RoundStartOutcome> {
    return this.prisma.$transaction(async (tx) => {
      const result = engineStartRound({ round, actor });

      await tx.battleCombatant.update({
        where: { id: actor.id },
        data: { reactionAvailable: true },
      });
      await this.persistConditions(tx, result.events);

      return result;
    });
  }

  /**
   * The idempotent no-op. `resolveTurn` consumes randomness, so re-running
   * it would produce a *different* result — the only way to make "the
   * same result, re-emitted" literally true is to read back what the
   * winner already persisted, never to resolve again.
   */
  private async reReadResolution(
    battleId: string,
    round: number,
  ): Promise<TurnResolutionOutcome> {
    const turns = await this.prisma.battleTurn.findMany({
      where: { battleId, round },
      orderBy: { sequence: 'asc' },
    });

    const combatants = await this.prisma.battleCombatant.findMany({
      where: { battleId },
      include: { conditions: true },
    });
    // The winner is already persisted by whichever caller won the claim —
    // read it back rather than re-deriving it a second time.
    const battle = await this.prisma.battle.findUniqueOrThrow({
      where: { id: battleId },
      select: { winnerId: true, endedAt: true },
    });

    const actorId = turns[0]?.actorId;
    const actorRow = combatants.find((combatant) => combatant.id === actorId);
    const defenderRow = combatants.find(
      (combatant) => combatant.id !== actorId,
    );

    if (!actorRow || !defenderRow) {
      throw new Error(
        `No persisted resolution found for battle ${battleId} round ${round}`,
      );
    }

    const actor = toCombatant(actorRow);
    const defender = toCombatant(defenderRow);
    const defeated = [actor, defender].find(
      (combatant) => combatant.currentHp <= 0,
    );

    return {
      battleId,
      round,
      turns: turns.map((turn) => ({
        round: turn.round,
        sequence: turn.sequence,
        actorId: turn.actorId,
        kind: turn.kind,
        skillCode: turn.skillCode,
        attackRoll: turn.attackRoll,
        attackTotal: turn.attackTotal,
        targetValue: turn.targetValue,
        hit: turn.hit,
        critical: turn.critical,
        damage: turn.damage,
      })),
      actor,
      defender,
      events: [],
      defeatedId: defeated?.id ?? null,
      winnerId: battle.winnerId,
      endedAt: battle.endedAt,
    };
  }
}

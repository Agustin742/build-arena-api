import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PLAYER_COLUMNS } from '../common/public-player';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicBattle } from './battle.mapper';
import type { BattleWithPlayers, PublicBattle } from './battle.mapper';
import type { CreateBattleDto } from './dto/create-battle.dto';
import { applyTransition, validateChallenge } from './rules';
import type { BattleTransition, TransitionOutcome } from './rules';

const FOREIGN_KEY_VIOLATION = 'P2003';

/** A battle is only ever rendered against the two players in it. */
const WITH_PLAYERS = {
  challenger: PLAYER_COLUMNS,
  opponent: PLAYER_COLUMNS,
};

/**
 * The same answer for a battle that does not exist and for one between two
 * other players. Telling them apart would let anyone map the arena.
 */
const NOT_FOUND = 'Battle not found';

@Injectable()
export class BattleService {
  constructor(private readonly prisma: PrismaService) {}

  async challenge(
    currentUserId: string,
    dto: CreateBattleDto,
  ): Promise<PublicBattle> {
    const draft = {
      challengerId: currentUserId,
      opponentId: dto.opponentId,
    };
    const violations = validateChallenge(draft);

    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'The challenge breaks the rules of the arena',
        violations,
      });
    }

    const challengerBuildId = await this.ownedBuildId(
      dto.buildId,
      currentUserId,
    );

    try {
      const created = await this.prisma.battle.create({
        data: { ...draft, challengerBuildId },
        include: WITH_PLAYERS,
      });

      return toPublicBattle(created, currentUserId);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === FOREIGN_KEY_VIOLATION
      ) {
        throw new NotFoundException('That player does not exist');
      }

      throw error;
    }
  }

  async findAll(currentUserId: string): Promise<PublicBattle[]> {
    const battles = await this.prisma.battle.findMany({
      where: { OR: participantClause(currentUserId) },
      include: WITH_PLAYERS,
      orderBy: { createdAt: 'desc' },
    });

    return (battles as BattleWithPlayers[]).map((battle) =>
      toPublicBattle(battle, currentUserId),
    );
  }

  async findOne(id: string, currentUserId: string): Promise<PublicBattle> {
    return toPublicBattle(
      await this.involvingCaller(id, currentUserId),
      currentUserId,
    );
  }

  accept(id: string, currentUserId: string): Promise<PublicBattle> {
    return this.move('ACCEPT', id, currentUserId);
  }

  reject(id: string, currentUserId: string): Promise<PublicBattle> {
    return this.move('REJECT', id, currentUserId);
  }

  cancel(id: string, currentUserId: string): Promise<PublicBattle> {
    return this.move('CANCEL', id, currentUserId);
  }

  /**
   * Every lifecycle move goes through the same door, so no route can forget
   * half of the check. The rules answer whether the move is legal AND whether
   * this caller is the one entitled to make it.
   */
  private async move(
    transition: BattleTransition,
    id: string,
    currentUserId: string,
  ): Promise<PublicBattle> {
    const battle = await this.involvingCaller(id, currentUserId);
    const outcome = applyTransition(transition, battle, currentUserId);

    assertAllowed(outcome);

    const moved = await this.prisma.battle.update({
      where: { id },
      data: { status: outcome.to },
      include: WITH_PLAYERS,
    });

    return toPublicBattle(moved, currentUserId);
  }

  /**
   * A build the caller does not own is never found, so fighting with somebody
   * else's build is impossible rather than merely forbidden.
   */
  private async ownedBuildId(
    buildId: string,
    currentUserId: string,
  ): Promise<string> {
    const build = await this.prisma.build.findFirst({
      where: { id: buildId, userId: currentUserId },
      select: { id: true },
    });

    if (!build) {
      throw new NotFoundException('The build does not exist, or is not yours');
    }

    return build.id;
  }

  /**
   * Scoping the lookup to the caller collapses "does not exist" and "is not
   * yours" into one answer, so nobody can probe which battles are running.
   */
  private async involvingCaller(
    id: string,
    currentUserId: string,
  ): Promise<BattleWithPlayers> {
    const battle = await this.prisma.battle.findFirst({
      where: { id, OR: participantClause(currentUserId) },
      include: WITH_PLAYERS,
    });

    if (!battle) {
      throw new NotFoundException(NOT_FOUND);
    }

    return battle;
  }
}

const participantClause = (currentUserId: string) => [
  { challengerId: currentUserId },
  { opponentId: currentUserId },
];

/**
 * A participant who may not make this move gets a 403 that names the reason:
 * they already know the battle exists, so hiding it behind a 404 would protect
 * nothing and teach nothing.
 */
function assertAllowed(
  outcome: TransitionOutcome,
): asserts outcome is Extract<TransitionOutcome, { allowed: true }> {
  if (outcome.allowed) {
    return;
  }

  if (outcome.reason === 'NOT_A_PARTICIPANT') {
    throw new NotFoundException(NOT_FOUND);
  }

  throw new ForbiddenException(outcome.message);
}

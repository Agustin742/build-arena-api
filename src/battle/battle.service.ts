import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { RandomSource } from '../combat';
import type { FriendshipStatus } from '../generated/prisma/enums';
import { PLAYER_COLUMNS } from '../common/public-player';
import { RANDOM_SOURCE } from '../common/random-source.token';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicBattle } from './battle.mapper';
import type {
  BattleSessionRow,
  BattleWithPlayers,
  PublicBattle,
} from './battle.mapper';
import type { AcceptBattleDto } from './dto/accept-battle.dto';
import type { CreateBattleDto } from './dto/create-battle.dto';
import {
  applyTransition,
  freezeCombatant,
  isRanked,
  participantClause,
  validateChallenge,
} from './rules';
import type {
  BattleTransition,
  CombatantAttributes,
  TransitionOutcome,
} from './rules';

const FOREIGN_KEY_VIOLATION = 'P2003';

/** A battle is only ever rendered against the two players in it. */
const WITH_PLAYERS = {
  challenger: PLAYER_COLUMNS,
  opponent: PLAYER_COLUMNS,
};

/** Everything the freeze needs off a build, and nothing else. */
const BUILD_STATS = {
  id: true,
  strength: true,
  magic: true,
  dexterity: true,
  constitution: true,
} as const;

type FightingBuild = CombatantAttributes & { id: string };

/**
 * The same answer for a battle that does not exist and for one between two
 * other players. Telling them apart would let anyone map the arena.
 */
const NOT_FOUND = 'Battle not found';

@Injectable()
export class BattleService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RANDOM_SOURCE) private readonly random: RandomSource,
  ) {}

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

    const build = await this.ownedBuild(dto.buildId, currentUserId);
    const friendship = await this.friendshipBetween(
      currentUserId,
      dto.opponentId,
    );

    try {
      const created = await this.prisma.battle.create({
        data: {
          ...draft,
          challengerBuildId: build.id,
          ranked: isRanked(friendship),
        },
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

  /**
   * The WebSocket gateway's read. Unlike `involvingCaller`, this never
   * throws: a stranger and a non-existent battle are the same `null` here,
   * so no HTTP exception ever has to cross into the socket layer. The
   * `include` carries everything a session needs to resume after a
   * reconnect — both frozen stat blocks, active conditions, and the full
   * turn history in the order it was played.
   */
  async findForParticipant(
    id: string,
    currentUserId: string,
  ): Promise<BattleSessionRow | null> {
    return this.prisma.battle.findFirst({
      where: { id, OR: participantClause(currentUserId) },
      include: {
        ...WITH_PLAYERS,
        combatants: { include: { conditions: true } },
        turns: { orderBy: [{ round: 'asc' }, { sequence: 'asc' }] },
      },
    });
  }

  /**
   * Accepting is where the two builds stop being editable. Both combatants are
   * frozen in the SAME statement that flips the status, so neither player can
   * see the other's build and change theirs before the fight starts.
   */
  async accept(
    id: string,
    currentUserId: string,
    dto: AcceptBattleDto,
  ): Promise<PublicBattle> {
    const battle = await this.involvingCaller(id, currentUserId);
    const outcome = applyTransition('ACCEPT', battle, currentUserId);

    assertAllowed(outcome);

    const challengerBuild = await this.committedBuild(battle);
    const opponentBuild = await this.ownedBuild(dto.buildId, currentUserId);

    const accepted = await this.prisma.battle.update({
      where: { id },
      data: {
        status: outcome.to,
        combatants: {
          create: [
            this.combatantFrom(battle.challengerId, challengerBuild),
            this.combatantFrom(battle.opponentId, opponentBuild),
          ],
        },
      },
      include: WITH_PLAYERS,
    });

    return toPublicBattle(accepted, currentUserId);
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

  /** One combatant, frozen off the build and tied to the player. */
  private combatantFrom(userId: string, build: FightingBuild) {
    return {
      userId,
      buildId: build.id,
      ...freezeCombatant(build, this.random),
    };
  }

  /**
   * A build the caller does not own is never found, so fighting with somebody
   * else's build is impossible rather than merely forbidden.
   */
  private async ownedBuild(
    buildId: string,
    currentUserId: string,
  ): Promise<FightingBuild> {
    const build = await this.prisma.build.findFirst({
      where: { id: buildId, userId: currentUserId },
      select: BUILD_STATS,
    });

    if (!build) {
      throw new NotFoundException('The build does not exist, or is not yours');
    }

    return build;
  }

  /**
   * The build the challenger committed to when they sent the challenge. It is
   * nullable because deleting a build must not delete a battle's history, so a
   * challenge can outlive the choice behind it. When that happens the freeze
   * has nothing to copy and the challenge is a dead letter: the challenged
   * player can still reject it, but nobody can accept it.
   */
  private async committedBuild(
    battle: BattleWithPlayers,
  ): Promise<FightingBuild> {
    const build = battle.challengerBuildId
      ? await this.prisma.build.findUnique({
          where: { id: battle.challengerBuildId },
          select: BUILD_STATS,
        })
      : null;

    if (!build) {
      throw new ConflictException(
        'The challenger no longer has the build they picked, so this challenge can no longer be accepted',
      );
    }

    return build;
  }

  /** The friendship between two players, in whichever direction it was opened. */
  private friendshipBetween(
    currentUserId: string,
    otherId: string,
  ): Promise<{ status: FriendshipStatus } | null> {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: currentUserId },
        ],
      },
      select: { status: true },
    });
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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { FriendshipStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateFriendshipDto } from './dto/create-friendship.dto';
import { PLAYER_COLUMNS, toPublicFriendship } from './friendship.mapper';
import type {
  FriendshipWithPlayers,
  PublicFriendship,
} from './friendship.mapper';
import {
  acceptRequest,
  removeFriendship,
  validateFriendshipRequest,
} from './rules';
import type { TransitionOutcome } from './rules';

const FOREIGN_KEY_VIOLATION = 'P2003';

/** A friendship is only ever rendered against the two players in it. */
const WITH_PLAYERS = {
  requester: PLAYER_COLUMNS,
  addressee: PLAYER_COLUMNS,
};

/**
 * The same answer for a friendship that does not exist and for one between two
 * other players. Telling them apart would let anyone map the social graph.
 */
const NOT_FOUND = 'Friendship not found';

@Injectable()
export class FriendshipService {
  constructor(private readonly prisma: PrismaService) {}

  async request(
    currentUserId: string,
    dto: CreateFriendshipDto,
  ): Promise<PublicFriendship> {
    const draft = {
      requesterId: currentUserId,
      addresseeId: dto.addresseeId,
    };
    const violations = validateFriendshipRequest(
      draft,
      await this.existingBetween(currentUserId, dto.addresseeId),
    );

    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'The friend request breaks the rules of the arena',
        violations,
      });
    }

    try {
      const created = await this.prisma.friendship.create({
        data: draft,
        include: WITH_PLAYERS,
      });

      return toPublicFriendship(created, currentUserId);
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

  async findAll(currentUserId: string): Promise<PublicFriendship[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: { OR: participantClause(currentUserId) },
      include: WITH_PLAYERS,
      orderBy: { createdAt: 'asc' },
    });

    return (friendships as FriendshipWithPlayers[]).map((friendship) =>
      toPublicFriendship(friendship, currentUserId),
    );
  }

  async accept(id: string, currentUserId: string): Promise<PublicFriendship> {
    const friendship = await this.involvingCaller(id, currentUserId);

    this.assertAllowed(acceptRequest(friendship, currentUserId));

    const accepted = await this.prisma.friendship.update({
      where: { id },
      data: { status: FriendshipStatus.ACCEPTED },
      include: WITH_PLAYERS,
    });

    return toPublicFriendship(accepted, currentUserId);
  }

  async remove(id: string, currentUserId: string): Promise<void> {
    const friendship = await this.involvingCaller(id, currentUserId);

    // Rejecting, cancelling and unfriending all drop the same row. The rules
    // name which one happened; the effect on the table is identical.
    this.assertAllowed(removeFriendship(friendship, currentUserId));

    await this.prisma.friendship.delete({ where: { id } });
  }

  /** The row between two players, in whichever direction it was opened. */
  private existingBetween(
    currentUserId: string,
    otherId: string,
  ): Promise<FriendshipWithPlayers | null> {
    return this.prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: currentUserId, addresseeId: otherId },
          { requesterId: otherId, addresseeId: currentUserId },
        ],
      },
      include: WITH_PLAYERS,
    });
  }

  /**
   * Scoping the lookup to the caller makes acting on a stranger's friendship
   * impossible rather than merely forbidden, and collapses "does not exist"
   * and "is not yours" into one answer.
   */
  private async involvingCaller(
    id: string,
    currentUserId: string,
  ): Promise<FriendshipWithPlayers> {
    const friendship = await this.prisma.friendship.findFirst({
      where: { id, OR: participantClause(currentUserId) },
      include: WITH_PLAYERS,
    });

    if (!friendship) {
      throw new NotFoundException(NOT_FOUND);
    }

    return friendship;
  }

  /**
   * A participant that may not make this move gets a 403 that names the
   * reason: they already know the friendship exists, so hiding it behind a
   * 404 would protect nothing and teach nothing.
   */
  private assertAllowed(outcome: TransitionOutcome): void {
    if (outcome.allowed) {
      return;
    }

    if (outcome.reason === 'NOT_A_PARTICIPANT') {
      throw new NotFoundException(NOT_FOUND);
    }

    throw new ForbiddenException(outcome.message);
  }
}

const participantClause = (currentUserId: string) => [
  { requesterId: currentUserId },
  { addresseeId: currentUserId },
];

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { BattleStatus, FriendshipStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { SequenceRandomSource } from '../combat';
import { BattleService } from './battle.service';

const ME = '11111111-0000-4000-8000-000000000001';
const RIVAL = '22222222-0000-4000-8000-000000000002';
const BATTLE_ID = '33333333-0000-4000-8000-000000000003';
const BUILD_ID = '44444444-0000-4000-8000-000000000004';
const OPPONENT_BUILD_ID = '55555555-0000-4000-8000-000000000005';

const challengerBuild = {
  id: BUILD_ID,
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
};

const opponentBuild = {
  id: OPPONENT_BUILD_ID,
  strength: 10,
  magic: 15,
  dexterity: 13,
  constitution: 12,
};

/** What a frozen combatant looks like on the way into the database. */
type FrozenRow = { userId: string; buildId: string; armorClass: number };

const players = {
  challenger: { id: ME, username: 'ada', rating: 1200 },
  opponent: { id: RIVAL, username: 'grace', rating: 1350 },
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: BATTLE_ID,
  challengerId: ME,
  opponentId: RIVAL,
  challengerBuildId: BUILD_ID,
  status: BattleStatus.PENDING,
  ranked: true,
  winnerId: null,
  currentRound: 0,
  activeUserId: null,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  startedAt: null,
  endedAt: null,
  ...players,
  ...overrides,
});

/** The same battle seen from the other side: they challenged me. */
const incoming = (overrides: Record<string, unknown> = {}) =>
  row({ challengerId: RIVAL, opponentId: ME, ...overrides });

const foreignKeyViolation = new Prisma.PrismaClientKnownRequestError(
  'Foreign key constraint failed',
  { code: 'P2003', clientVersion: 'test' },
);

/** The rules a call broke, read off the 400 the service throws. */
const brokenRules = async (act: () => Promise<unknown>): Promise<string[]> => {
  try {
    await act();
  } catch (error: unknown) {
    const response = (error as BadRequestException).getResponse() as {
      violations?: { rule: string }[];
    };

    return (response.violations ?? []).map((entry) => entry.rule);
  }

  throw new Error('Expected the call to be rejected');
};

describe('BattleService', () => {
  const battle = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const build = { findFirst: jest.fn(), findUnique: jest.fn() };
  const friendship = { findFirst: jest.fn() };
  const prisma = { battle, build, friendship } as unknown as PrismaService;
  // Scripted rolls, so initiative is replayable instead of random. Two draws
  // per freeze, with room to spare across the suite.
  const service = new BattleService(
    prisma,
    new SequenceRandomSource(Array.from({ length: 40 }, () => 10)),
  );

  /** The single create the service issued, typed for reading. */
  const createArgs = () => {
    const [call] = battle.create.mock.calls as [
      [{ data: { ranked: boolean; challengerBuildId: string } }],
    ];

    return call[0];
  };

  /** The single update the service issued, typed for reading. */
  const updateArgs = () => {
    const [call] = battle.update.mock.calls as [
      [
        {
          data: {
            status: BattleStatus;
            combatants: { create: FrozenRow[] };
          };
        },
      ],
    ];

    return call[0];
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('challenge', () => {
    it('opens a pending challenge towards another player', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      battle.create.mockResolvedValue(row());

      const created = await service.challenge(ME, {
        opponentId: RIVAL,
        buildId: BUILD_ID,
      });

      expect(created).toMatchObject({
        role: 'CHALLENGER',
        status: BattleStatus.PENDING,
        rival: players.opponent,
      });
    });

    it('takes the challenger from the token, never from the payload', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      battle.create.mockResolvedValue(row());

      await service.challenge(ME, {
        opponentId: RIVAL,
        buildId: BUILD_ID,
        challengerId: RIVAL,
      } as never);

      const [call] = battle.create.mock.calls as [
        [{ data: { challengerId: string } }],
      ];

      expect(call[0].data.challengerId).toBe(ME);
    });

    it('remembers the build so the freeze has something to read later', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      battle.create.mockResolvedValue(row());

      await service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID });

      const [call] = battle.create.mock.calls as [
        [{ data: { challengerBuildId: string } }],
      ];

      expect(call[0].data.challengerBuildId).toBe(BUILD_ID);
    });

    it('refuses to challenge yourself', async () => {
      await expect(
        brokenRules(() =>
          service.challenge(ME, { opponentId: ME, buildId: BUILD_ID }),
        ),
      ).resolves.toEqual(['SELF_CHALLENGE']);
      expect(battle.create).not.toHaveBeenCalled();
    });

    it('answers 404 when the build is not the challengers own', async () => {
      build.findFirst.mockResolvedValue(null);

      await expect(
        service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(battle.create).not.toHaveBeenCalled();
    });

    it('scopes the build lookup to the challenger', async () => {
      build.findFirst.mockResolvedValue(null);

      await expect(
        service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID }),
      ).rejects.toThrow();

      const [call] = build.findFirst.mock.calls as [
        [{ where: { id: string; userId: string } }],
      ];

      expect(call[0].where).toEqual({ id: BUILD_ID, userId: ME });
    });

    it('answers 404 when the other player does not exist', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      battle.create.mockRejectedValue(foreignKeyViolation);

      await expect(
        service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ranks a battle between players who are not friends', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      friendship.findFirst.mockResolvedValue(null);
      battle.create.mockResolvedValue(row());

      await service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID });

      expect(createArgs().data.ranked).toBe(true);
    });

    it('does not rank a battle between accepted friends', async () => {
      build.findFirst.mockResolvedValue(challengerBuild);
      friendship.findFirst.mockResolvedValue({
        status: FriendshipStatus.ACCEPTED,
      });
      battle.create.mockResolvedValue(row({ ranked: false }));

      await service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID });

      expect(createArgs().data.ranked).toBe(false);
    });

    it('looks for the friendship in both directions', async () => {
      // One row per friendship, opened in whichever direction: reading only
      // the column you sent would rank half of the matches between friends.
      build.findFirst.mockResolvedValue(challengerBuild);
      friendship.findFirst.mockResolvedValue(null);
      battle.create.mockResolvedValue(row());

      await service.challenge(ME, { opponentId: RIVAL, buildId: BUILD_ID });

      const [call] = friendship.findFirst.mock.calls as [
        [{ where: { OR: { requesterId: string; addresseeId: string }[] } }],
      ];

      expect(call[0].where.OR).toEqual([
        { requesterId: ME, addresseeId: RIVAL },
        { requesterId: RIVAL, addresseeId: ME },
      ]);
    });
  });

  describe('findAll', () => {
    it('lists the battles of both directions, rendered for the viewer', async () => {
      battle.findMany.mockResolvedValue([row(), incoming()]);

      const listed = await service.findAll(ME);

      expect(listed.map((entry) => entry.role)).toEqual([
        'CHALLENGER',
        'OPPONENT',
      ]);
    });
  });

  describe('accept', () => {
    /** Both sides pick a build, and both builds are still there. */
    const bothBuildsReady = () => {
      battle.findFirst.mockResolvedValue(incoming());
      build.findUnique.mockResolvedValue(challengerBuild);
      build.findFirst.mockResolvedValue(opponentBuild);
      battle.update.mockResolvedValue(
        incoming({ status: BattleStatus.ACCEPTED }),
      );
    };

    it('accepts a challenge addressed to the caller', async () => {
      bothBuildsReady();

      const accepted = await service.accept(BATTLE_ID, ME, {
        buildId: OPPONENT_BUILD_ID,
      });

      expect(updateArgs().data.status).toBe(BattleStatus.ACCEPTED);
      expect(accepted.status).toBe(BattleStatus.ACCEPTED);
    });

    it('freezes both combatants in the statement that flips the status', async () => {
      // One statement, one transaction. If the freeze were a second call, a
      // battle could end up accepted with nobody in it.
      bothBuildsReady();

      await service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID });

      const frozen = updateArgs().data.combatants.create;

      expect(frozen).toHaveLength(2);
      expect(frozen.map((combatant) => combatant.userId)).toEqual([RIVAL, ME]);
    });

    it('copies the attributes and the derived stats off each build', async () => {
      bothBuildsReady();

      await service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID });

      const [challenger] = updateArgs().data.combatants.create;

      expect(challenger).toMatchObject({
        buildId: BUILD_ID,
        strength: 15,
        magic: 13,
        dexterity: 12,
        constitution: 10,
        armorClass: 11,
        maxHp: 30,
        currentHp: 30,
      });
    });

    it('refuses to accept when the challenger no longer has their build', async () => {
      // The column is nullable so that deleting a build cannot delete a
      // battle's history. The price is a challenge that outlived its choice,
      // and it must not be accepted with made up numbers.
      battle.findFirst.mockResolvedValue(incoming({ challengerBuildId: null }));

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(battle.update).not.toHaveBeenCalled();
    });

    it('answers 404 when the accepting player does not own the build', async () => {
      battle.findFirst.mockResolvedValue(incoming());
      build.findUnique.mockResolvedValue(challengerBuild);
      build.findFirst.mockResolvedValue(null);

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(battle.update).not.toHaveBeenCalled();
    });

    it('does not let the challenger accept their own challenge', async () => {
      // The trap of the phase: the battle IS pending, and the caller IS a
      // participant. Only the entitlement check stops it.
      battle.findFirst.mockResolvedValue(row());

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(battle.update).not.toHaveBeenCalled();
    });

    it('does not accept a challenge that is no longer pending', async () => {
      battle.findFirst.mockResolvedValue(
        incoming({ status: BattleStatus.CANCELLED }),
      );

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('answers 404 on a battle the caller is not in', async () => {
      battle.findFirst.mockResolvedValue(null);

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('scopes the lookup to the caller', async () => {
      battle.findFirst.mockResolvedValue(null);

      await expect(
        service.accept(BATTLE_ID, ME, { buildId: OPPONENT_BUILD_ID }),
      ).rejects.toThrow();

      const [call] = battle.findFirst.mock.calls as [
        [{ where: { id: string; OR: Record<string, string>[] } }],
      ];

      expect(call[0].where).toMatchObject({
        id: BATTLE_ID,
        OR: [{ challengerId: ME }, { opponentId: ME }],
      });
    });
  });

  describe('reject', () => {
    it('lets the challenged player reject', async () => {
      battle.findFirst.mockResolvedValue(incoming());
      battle.update.mockResolvedValue(
        incoming({ status: BattleStatus.REJECTED }),
      );

      await expect(service.reject(BATTLE_ID, ME)).resolves.toMatchObject({
        status: BattleStatus.REJECTED,
      });
    });

    it('does not let the challenger reject their own challenge', async () => {
      battle.findFirst.mockResolvedValue(row());

      await expect(service.reject(BATTLE_ID, ME)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('cancel', () => {
    it('lets the challenger cancel while it is pending', async () => {
      battle.findFirst.mockResolvedValue(row());
      battle.update.mockResolvedValue(row({ status: BattleStatus.CANCELLED }));

      await expect(service.cancel(BATTLE_ID, ME)).resolves.toMatchObject({
        status: BattleStatus.CANCELLED,
      });
    });

    it('does not let the challenged player cancel', async () => {
      battle.findFirst.mockResolvedValue(incoming());

      await expect(service.cancel(BATTLE_ID, ME)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(battle.update).not.toHaveBeenCalled();
    });

    it('does not cancel a challenge that was already accepted', async () => {
      battle.findFirst.mockResolvedValue(
        row({ status: BattleStatus.ACCEPTED }),
      );

      await expect(service.cancel(BATTLE_ID, ME)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('findOne', () => {
    it('answers 404 on a battle the caller is not in', async () => {
      battle.findFirst.mockResolvedValue(null);

      await expect(service.findOne(BATTLE_ID, ME)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

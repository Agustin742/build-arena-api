import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { FriendshipStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { FriendshipService } from './friendship.service';

const ME = '11111111-0000-4000-8000-000000000001';
const OTHER = '22222222-0000-4000-8000-000000000002';
const FRIENDSHIP_ID = '33333333-0000-4000-8000-000000000003';

const players = {
  requester: { id: ME, username: 'ada', rating: 1200 },
  addressee: { id: OTHER, username: 'grace', rating: 1350 },
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: FRIENDSHIP_ID,
  requesterId: ME,
  addresseeId: OTHER,
  status: FriendshipStatus.PENDING,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  ...players,
  ...overrides,
});

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

describe('FriendshipService', () => {
  const friendship = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = { friendship } as unknown as PrismaService;
  const service = new FriendshipService(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('request', () => {
    it('opens a pending request towards another player', async () => {
      friendship.findFirst.mockResolvedValue(null);
      friendship.create.mockResolvedValue(row());

      const created = await service.request(ME, { addresseeId: OTHER });

      expect(created).toMatchObject({
        direction: 'OUTGOING',
        status: FriendshipStatus.PENDING,
        player: players.addressee,
      });
    });

    it('takes the requester from the token, never from the payload', async () => {
      friendship.findFirst.mockResolvedValue(null);
      friendship.create.mockResolvedValue(row());

      await service.request(ME, {
        addresseeId: OTHER,
        requesterId: OTHER,
      } as never);

      const [call] = friendship.create.mock.calls as [
        [{ data: { requesterId: string } }],
      ];

      expect(call[0].data.requesterId).toBe(ME);
    });

    it('looks for an existing friendship in both directions', async () => {
      friendship.findFirst.mockResolvedValue(null);
      friendship.create.mockResolvedValue(row());

      await service.request(ME, { addresseeId: OTHER });

      const [call] = friendship.findFirst.mock.calls as [
        [{ where: { OR: { requesterId: string; addresseeId: string }[] } }],
      ];

      expect(call[0].where.OR).toEqual([
        { requesterId: ME, addresseeId: OTHER },
        { requesterId: OTHER, addresseeId: ME },
      ]);
    });

    it('refuses to befriend yourself', async () => {
      friendship.findFirst.mockResolvedValue(null);

      await expect(
        brokenRules(() => service.request(ME, { addresseeId: ME })),
      ).resolves.toEqual(['SELF_FRIENDSHIP']);
      expect(friendship.create).not.toHaveBeenCalled();
    });

    it('refuses a request when the mirror request already exists', async () => {
      friendship.findFirst.mockResolvedValue(
        row({ requesterId: OTHER, addresseeId: ME }),
      );

      await expect(
        brokenRules(() => service.request(ME, { addresseeId: OTHER })),
      ).resolves.toEqual(['DUPLICATE_REQUEST']);
      expect(friendship.create).not.toHaveBeenCalled();
    });

    it('answers 404 when the other player does not exist', async () => {
      friendship.findFirst.mockResolvedValue(null);
      friendship.create.mockRejectedValue(foreignKeyViolation);

      await expect(
        service.request(ME, { addresseeId: OTHER }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('lists the friendships of both directions, rendered for the viewer', async () => {
      friendship.findMany.mockResolvedValue([
        row(),
        row({ requesterId: OTHER, addresseeId: ME }),
      ]);

      const listed = await service.findAll(ME);

      expect(listed.map((entry) => entry.direction)).toEqual([
        'OUTGOING',
        'INCOMING',
      ]);
    });
  });

  describe('accept', () => {
    it('accepts a request addressed to the caller', async () => {
      friendship.findFirst.mockResolvedValue(
        row({ requesterId: OTHER, addresseeId: ME }),
      );
      friendship.update.mockResolvedValue(
        row({
          requesterId: OTHER,
          addresseeId: ME,
          status: FriendshipStatus.ACCEPTED,
        }),
      );

      const accepted = await service.accept(FRIENDSHIP_ID, ME);

      expect(friendship.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FRIENDSHIP_ID },
          data: { status: FriendshipStatus.ACCEPTED },
        }),
      );
      expect(accepted.status).toBe(FriendshipStatus.ACCEPTED);
    });

    it('does not let the requester accept their own request', async () => {
      // The trap of the phase: the row IS pending, and the caller IS a
      // participant. Only the second check stops it.
      friendship.findFirst.mockResolvedValue(row());

      await expect(service.accept(FRIENDSHIP_ID, ME)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(friendship.update).not.toHaveBeenCalled();
    });

    it('does not accept a friendship that is already accepted', async () => {
      friendship.findFirst.mockResolvedValue(
        row({
          requesterId: OTHER,
          addresseeId: ME,
          status: FriendshipStatus.ACCEPTED,
        }),
      );

      await expect(service.accept(FRIENDSHIP_ID, ME)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('answers 404 on a friendship the caller is not part of', async () => {
      friendship.findFirst.mockResolvedValue(null);

      await expect(service.accept(FRIENDSHIP_ID, ME)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('scopes the lookup to the caller', async () => {
      friendship.findFirst.mockResolvedValue(null);

      await expect(service.accept(FRIENDSHIP_ID, ME)).rejects.toThrow();

      const [call] = friendship.findFirst.mock.calls as [
        [{ where: { id: string; OR: Record<string, string>[] } }],
      ];

      expect(call[0].where).toMatchObject({
        id: FRIENDSHIP_ID,
        OR: [{ requesterId: ME }, { addresseeId: ME }],
      });
    });
  });

  describe('remove', () => {
    it('drops a friendship the caller is part of', async () => {
      friendship.findFirst.mockResolvedValue(row());
      friendship.delete.mockResolvedValue(row());

      await service.remove(FRIENDSHIP_ID, ME);

      expect(friendship.delete).toHaveBeenCalledWith({
        where: { id: FRIENDSHIP_ID },
      });
    });

    it('answers 404 on a friendship the caller is not part of', async () => {
      friendship.findFirst.mockResolvedValue(null);

      await expect(service.remove(FRIENDSHIP_ID, ME)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(friendship.delete).not.toHaveBeenCalled();
    });
  });
});

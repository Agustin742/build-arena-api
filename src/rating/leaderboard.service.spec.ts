import { DEFAULT_PAGE_SIZE, LeaderboardService } from './leaderboard.service';
import type { PrismaService } from '../prisma/prisma.service';

const findMany = jest.fn();
const prisma = { user: { findMany } } as unknown as PrismaService;
const service = new LeaderboardService(prisma);

const player = (username: string, rating: number) => ({
  id: `id-${username}`,
  username,
  rating,
});

describe('LeaderboardService.findTop', () => {
  beforeEach(() => jest.clearAllMocks());

  it('numbers the ranks from one, in the order storage returned', async () => {
    findMany.mockResolvedValue([
      player('ada', 1500),
      player('linus', 1400),
      player('grace', 1300),
    ]);

    const board = await service.findTop(10);

    expect(board.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(board.map((entry) => entry.username)).toEqual([
      'ada',
      'linus',
      'grace',
    ]);
  });

  it('orders by rating first and breaks ties by username', async () => {
    await service.findTop(10);

    const [args] = findMany.mock.calls[0] as [
      { orderBy: Record<string, string>[] },
    ];

    // Without the second key two equally rated players swap places between
    // requests, and a ranking that reshuffles on refresh is not a ranking.
    expect(args.orderBy).toEqual([{ rating: 'desc' }, { username: 'asc' }]);
  });

  it('never selects a column that is not public', async () => {
    await service.findTop(10);

    const [args] = findMany.mock.calls[0] as [
      { select: Record<string, boolean> },
    ];

    expect(args.select).toEqual({ id: true, username: true, rating: true });
  });

  it('falls back to the default page size when no limit is given', async () => {
    await service.findTop(undefined);

    const [args] = findMany.mock.calls[0] as [{ take: number }];

    expect(args.take).toBe(DEFAULT_PAGE_SIZE);
  });

  it('honours a caller-supplied limit', async () => {
    await service.findTop(5);

    const [args] = findMany.mock.calls[0] as [{ take: number }];

    expect(args.take).toBe(5);
  });

  it('returns an empty board rather than failing when nobody has played', async () => {
    findMany.mockResolvedValue([]);

    await expect(service.findTop(10)).resolves.toEqual([]);
  });
});

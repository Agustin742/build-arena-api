import { LeaderboardController } from './leaderboard.controller';
import type { LeaderboardService } from './leaderboard.service';

describe('LeaderboardController', () => {
  const findTop = jest.fn();
  const service = { findTop } as unknown as LeaderboardService;
  const controller = new LeaderboardController(service);

  beforeEach(() => jest.clearAllMocks());

  it('passes the requested limit straight through', async () => {
    findTop.mockResolvedValue([]);

    await controller.findTop({ limit: 5 });

    expect(findTop).toHaveBeenCalledWith(5);
  });

  it('lets the service decide the page size when the query omits it', async () => {
    findTop.mockResolvedValue([]);

    await controller.findTop({});

    expect(findTop).toHaveBeenCalledWith(undefined);
  });
});

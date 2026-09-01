import { BattleController } from './battle.controller';

import type { BattleService } from './battle.service';
import type { CreateBattleDto } from './dto/create-battle.dto';

const user = { id: '11111111-0000-4000-8000-000000000009', username: 'sylas' };
const BATTLE_ID = '22222222-0000-4000-8000-000000000001';
const BUILD_ID = '44444444-0000-4000-8000-000000000004';

const dto: CreateBattleDto = {
  opponentId: '33333333-0000-4000-8000-000000000003',
  buildId: '44444444-0000-4000-8000-000000000004',
};

describe('BattleController', () => {
  let service: {
    challenge: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    accept: jest.Mock;
    reject: jest.Mock;
    cancel: jest.Mock;
  };
  let controller: BattleController;

  beforeEach(() => {
    service = {
      challenge: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      accept: jest.fn().mockResolvedValue({}),
      reject: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
    };
    controller = new BattleController(service as unknown as BattleService);
  });

  it('challenges on behalf of the user in the token', async () => {
    await controller.challenge(user, dto);

    expect(service.challenge).toHaveBeenCalledWith(user.id, dto);
  });

  it('lists only the battles of the user in the token', async () => {
    await controller.findAll(user);

    expect(service.findAll).toHaveBeenCalledWith(user.id);
  });

  it('reads as the user in the token', async () => {
    await controller.findOne(BATTLE_ID, user);

    expect(service.findOne).toHaveBeenCalledWith(BATTLE_ID, user.id);
  });

  it.each([
    ['accept', 'accept'],
    ['reject', 'reject'],
    ['cancel', 'cancel'],
  ] as const)(
    'runs %s as the user in the token, not as whoever the path names',
    async (route, method) => {
      if (route === 'accept') {
        await controller.accept(BATTLE_ID, user, { buildId: BUILD_ID });
      } else {
        await controller[route](BATTLE_ID, user);
      }

      expect(service[method]).toHaveBeenCalledWith(
        BATTLE_ID,
        user.id,
        ...(route === 'accept' ? [{ buildId: BUILD_ID }] : []),
      );
    },
  );
});

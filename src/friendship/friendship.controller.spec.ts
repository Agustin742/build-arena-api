import { FriendshipController } from './friendship.controller';

import type { CreateFriendshipDto } from './dto/create-friendship.dto';
import type { FriendshipService } from './friendship.service';

const user = { id: '11111111-0000-4000-8000-000000000009', username: 'sylas' };
const FRIENDSHIP_ID = '22222222-0000-4000-8000-000000000001';

const dto: CreateFriendshipDto = {
  addresseeId: '33333333-0000-4000-8000-000000000003',
};

describe('FriendshipController', () => {
  let service: {
    request: jest.Mock;
    findAll: jest.Mock;
    accept: jest.Mock;
    remove: jest.Mock;
  };
  let controller: FriendshipController;

  beforeEach(() => {
    service = {
      request: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      accept: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    controller = new FriendshipController(
      service as unknown as FriendshipService,
    );
  });

  it('sends the request on behalf of the user in the token', async () => {
    await controller.request(user, dto);

    expect(service.request).toHaveBeenCalledWith(user.id, dto);
  });

  it('lists only the friendships of the user in the token', async () => {
    await controller.findAll(user);

    expect(service.findAll).toHaveBeenCalledWith(user.id);
  });

  it('accepts as the user in the token, not as whoever the path names', async () => {
    await controller.accept(FRIENDSHIP_ID, user);

    expect(service.accept).toHaveBeenCalledWith(FRIENDSHIP_ID, user.id);
  });

  it('drops as the user in the token', async () => {
    await controller.remove(FRIENDSHIP_ID, user);

    expect(service.remove).toHaveBeenCalledWith(FRIENDSHIP_ID, user.id);
  });
});

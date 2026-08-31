import { BuildController } from './build.controller';

import type { BuildService } from './build.service';
import type { CreateBuildDto } from './dto/create-build.dto';

const user = { id: '11111111-0000-4000-8000-000000000009', username: 'sylas' };
const BUILD_ID = '22222222-0000-4000-8000-000000000001';

const dto: CreateBuildDto = {
  name: 'Hybrid duelist',
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
};

describe('BuildController', () => {
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };
  let controller: BuildController;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({}),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    controller = new BuildController(service as unknown as BuildService);
  });

  it('creates on behalf of the user in the token', async () => {
    await controller.create(user, dto);

    expect(service.create).toHaveBeenCalledWith(user.id, dto);
  });

  it('lists only the builds of the user in the token', async () => {
    await controller.findAll(user);

    expect(service.findAll).toHaveBeenCalledWith(user.id);
  });

  it('passes the owner along when reading one build', async () => {
    await controller.findOne(BUILD_ID, user);

    expect(service.findOne).toHaveBeenCalledWith(BUILD_ID, user.id);
  });

  it('passes the owner along when updating', async () => {
    await controller.update(BUILD_ID, user, { name: 'Renamed' });

    expect(service.update).toHaveBeenCalledWith(BUILD_ID, user.id, {
      name: 'Renamed',
    });
  });

  it('passes the owner along when deleting', async () => {
    await controller.remove(BUILD_ID, user);

    expect(service.remove).toHaveBeenCalledWith(BUILD_ID, user.id);
  });
});

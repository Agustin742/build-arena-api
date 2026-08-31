import { SkillController } from './skill.controller';
import type { SkillService } from './skill.service';
import type { PublicSkill } from './skill.mapper';

describe('SkillController', () => {
  it('hands the catalog back exactly as the service resolved it', async () => {
    const catalog: PublicSkill[] = [];
    const findAll = jest.fn().mockResolvedValue(catalog);
    const controller = new SkillController({
      findAll,
    } as unknown as SkillService);

    await expect(controller.findAll()).resolves.toBe(catalog);
    expect(findAll).toHaveBeenCalledTimes(1);
  });
});

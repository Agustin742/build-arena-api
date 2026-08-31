import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { Attribute, SkillType } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';
import { BuildService } from './build.service';
import type { CreateBuildDto } from './dto/create-build.dto';

const OWNER = '11111111-0000-4000-8000-000000000009';
const BUILD_ID = '22222222-0000-4000-8000-000000000001';

const catalogRow = (
  code: string,
  type: SkillType,
  cost: number,
  requiredAttribute: Attribute,
  requiredValue: number,
) => ({
  id: `id-${code}`,
  code,
  name: code,
  description: code,
  type,
  cost,
  requiredAttribute,
  requiredValue,
  damageDice: null,
  appliesCondition: null,
  conditionRounds: null,
});

const catalog = [
  catalogRow('POWER_STRIKE', SkillType.ACTION, 4, Attribute.STRENGTH, 12),
  catalogRow('FIREBALL', SkillType.ACTION, 5, Attribute.MAGIC, 12),
  catalogRow('PARRY', SkillType.REACTION, 4, Attribute.STRENGTH, 12),
  catalogRow('DODGE', SkillType.REACTION, 4, Attribute.DEXTERITY, 12),
  catalogRow('MIND_SPIKE', SkillType.ACTION, 7, Attribute.MAGIC, 14),
  catalogRow('RIPOSTE', SkillType.REACTION, 7, Attribute.DEXTERITY, 14),
];

const legal: CreateBuildDto = {
  name: 'Hybrid duelist',
  strength: 15,
  magic: 13,
  dexterity: 12,
  constitution: 10,
  skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
};

const storedBuild = {
  id: BUILD_ID,
  userId: OWNER,
  name: legal.name,
  strength: legal.strength,
  magic: legal.magic,
  dexterity: legal.dexterity,
  constitution: legal.constitution,
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  skills: legal.skillCodes.map((code) => ({
    buildId: BUILD_ID,
    skillId: `id-${code}`,
    skill: catalog.find((entry) => entry.code === code),
  })),
};

const overspent = { ...legal, strength: 15, magic: 15, dexterity: 15 };

/** The rules a call broke, read off the 400 the service throws. */
const brokenRules = async (act: () => Promise<unknown>): Promise<string[]> => {
  try {
    await act();
  } catch (error: unknown) {
    const response = (error as BadRequestException).getResponse() as {
      violations?: { rule: string }[];
    };

    return (response.violations ?? []).map((violation) => violation.rule);
  }

  return [];
};

describe('BuildService', () => {
  let skillFindMany: jest.Mock;
  let buildCreate: jest.Mock;
  let buildFindMany: jest.Mock;
  let buildFindFirst: jest.Mock;
  let buildUpdate: jest.Mock;
  let buildDeleteMany: jest.Mock;
  let service: BuildService;

  beforeEach(() => {
    skillFindMany = jest
      .fn()
      .mockImplementation(({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(
          catalog.filter((entry) => where.code.in.includes(entry.code)),
        ),
      );
    buildCreate = jest.fn().mockResolvedValue(storedBuild);
    buildFindMany = jest.fn().mockResolvedValue([storedBuild]);
    buildFindFirst = jest.fn().mockResolvedValue(storedBuild);
    buildUpdate = jest.fn().mockResolvedValue(storedBuild);
    buildDeleteMany = jest.fn().mockResolvedValue({ count: 1 });

    service = new BuildService({
      skill: { findMany: skillFindMany },
      build: {
        create: buildCreate,
        findMany: buildFindMany,
        findFirst: buildFindFirst,
        update: buildUpdate,
        deleteMany: buildDeleteMany,
      },
    } as unknown as PrismaService);
  });

  describe('create', () => {
    it('stores a legal build and hands it back without the owner', async () => {
      const build = await service.create(OWNER, legal);

      expect(build.name).toBe('Hybrid duelist');
      expect(build).not.toHaveProperty('userId');
    });

    it('takes the owner from the token, never from the payload', async () => {
      await service.create(OWNER, {
        ...legal,
        userId: 'someone-else',
      } as CreateBuildDto);

      const [args] = buildCreate.mock.calls[0] as [
        { data: { userId: string } },
      ];

      expect(args.data.userId).toBe(OWNER);
    });

    it('rejects an illegal build', async () => {
      await expect(service.create(OWNER, overspent)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('names the broken rule in the rejection', async () => {
      await expect(
        brokenRules(() => service.create(OWNER, overspent)),
      ).resolves.toEqual(['ATTRIBUTE_BUDGET_EXCEEDED']);
    });

    it('never writes when the build is illegal', async () => {
      await expect(service.create(OWNER, overspent)).rejects.toThrow();

      expect(buildCreate).not.toHaveBeenCalled();
    });

    it('rejects a kit the player cannot afford', async () => {
      const expensive = {
        ...legal,
        strength: 8,
        magic: 14,
        dexterity: 14,
        constitution: 8,
        skillCodes: ['MIND_SPIKE', 'FIREBALL', 'RIPOSTE', 'DODGE'],
      };

      await expect(
        brokenRules(() => service.create(OWNER, expensive)),
      ).resolves.toContain('KIT_BUDGET_EXCEEDED');
    });

    it('reports a name the player already used as a conflict', async () => {
      buildCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.create(OWNER, legal)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('only ever lists the builds of the caller', async () => {
      await service.findAll(OWNER);

      expect(buildFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: OWNER } }),
      );
    });
  });

  describe('findOne', () => {
    it('narrows the query by owner instead of checking afterwards', async () => {
      await service.findOne(BUILD_ID, OWNER);

      expect(buildFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: BUILD_ID, userId: OWNER } }),
      );
    });

    it('answers 404 on a build that belongs to somebody else', async () => {
      buildFindFirst.mockResolvedValue(null);

      await expect(
        service.findOne(BUILD_ID, 'intruder'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('answers 404 before validating anything on a foreign build', async () => {
      buildFindFirst.mockResolvedValue(null);

      await expect(
        service.update(BUILD_ID, 'intruder', { name: 'stolen' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(buildUpdate).not.toHaveBeenCalled();
    });

    it('validates the merge of the change and what is already stored', async () => {
      await expect(
        brokenRules(() => service.update(BUILD_ID, OWNER, { magic: 15 })),
      ).resolves.toContain('ATTRIBUTE_BUDGET_EXCEEDED');
    });

    it('keeps the stored kit when the change does not mention skills', async () => {
      await service.update(BUILD_ID, OWNER, { name: 'Renamed' });

      const [args] = buildUpdate.mock.calls[0] as [
        { data: { name: string; skills?: unknown } },
      ];

      expect(args.data.name).toBe('Renamed');
      expect(args.data.skills).toBeUndefined();
    });

    it('replaces the whole kit rather than adding to it', async () => {
      await service.update(BUILD_ID, OWNER, {
        skillCodes: ['POWER_STRIKE', 'FIREBALL', 'PARRY', 'DODGE'],
      });

      const [args] = buildUpdate.mock.calls[0] as [
        { data: { skills: { deleteMany: unknown; create: unknown[] } } },
      ];

      expect(args.data.skills.deleteMany).toEqual({});
      expect(args.data.skills.create).toHaveLength(4);
    });
  });

  describe('remove', () => {
    it('deletes through an owner scoped query', async () => {
      await service.remove(BUILD_ID, OWNER);

      expect(buildDeleteMany).toHaveBeenCalledWith({
        where: { id: BUILD_ID, userId: OWNER },
      });
    });

    it('answers 404 when the scoped delete matched nothing', async () => {
      buildDeleteMany.mockResolvedValue({ count: 0 });

      await expect(service.remove(BUILD_ID, 'intruder')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});

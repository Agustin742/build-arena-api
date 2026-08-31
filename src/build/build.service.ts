import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicBuild } from './build.mapper';
import type { BuildWithSkills, PublicBuild } from './build.mapper';
import type { CreateBuildDto } from './dto/create-build.dto';
import type { UpdateBuildDto } from './dto/update-build.dto';
import { validateBuild } from './rules';
import type { BuildDraft } from './rules';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

/** A build is only ever useful with its kit resolved. */
const WITH_SKILLS = { skills: { include: { skill: true } } };

/**
 * The same answer for a build that does not exist and for one that belongs to
 * somebody else. Telling them apart would let anyone map what exists.
 */
const NOT_FOUND = 'Build not found';

@Injectable()
export class BuildService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    currentUserId: string,
    dto: CreateBuildDto,
  ): Promise<PublicBuild> {
    await this.assertLegal(dto);

    try {
      const build = await this.prisma.build.create({
        data: {
          userId: currentUserId,
          name: dto.name,
          strength: dto.strength,
          magic: dto.magic,
          dexterity: dto.dexterity,
          constitution: dto.constitution,
          skills: { create: connectByCode(dto.skillCodes) },
        },
        include: WITH_SKILLS,
      });

      return toPublicBuild(build);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('You already have a build with that name');
      }

      throw error;
    }
  }

  async findAll(currentUserId: string): Promise<PublicBuild[]> {
    const builds = await this.prisma.build.findMany({
      where: { userId: currentUserId },
      include: WITH_SKILLS,
      orderBy: { createdAt: 'asc' },
    });

    return (builds as BuildWithSkills[]).map(toPublicBuild);
  }

  async findOne(id: string, currentUserId: string): Promise<PublicBuild> {
    return toPublicBuild(await this.ownedBuild(id, currentUserId));
  }

  async update(
    id: string,
    currentUserId: string,
    dto: UpdateBuildDto,
  ): Promise<PublicBuild> {
    const current = await this.ownedBuild(id, currentUserId);
    const storedCodes = current.skills.map((entry) => entry.skill.code);

    await this.assertLegal({
      strength: dto.strength ?? current.strength,
      magic: dto.magic ?? current.magic,
      dexterity: dto.dexterity ?? current.dexterity,
      constitution: dto.constitution ?? current.constitution,
      skillCodes: dto.skillCodes ?? storedCodes,
    });

    try {
      const build = await this.prisma.build.update({
        where: { id },
        data: {
          name: dto.name,
          strength: dto.strength,
          magic: dto.magic,
          dexterity: dto.dexterity,
          constitution: dto.constitution,
          // A kit is four slots, not a list to append to: it is replaced whole.
          skills: dto.skillCodes && {
            deleteMany: {},
            create: connectByCode(dto.skillCodes),
          },
        },
        include: WITH_SKILLS,
      });

      return toPublicBuild(build);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('You already have a build with that name');
      }

      throw error;
    }
  }

  async remove(id: string, currentUserId: string): Promise<void> {
    // Scoping the delete makes deleting somebody else's build impossible,
    // rather than merely forbidden.
    const deleted = await this.prisma.build.deleteMany({
      where: { id, userId: currentUserId },
    });

    if (deleted.count === 0) {
      throw new NotFoundException(NOT_FOUND);
    }
  }

  private async ownedBuild(
    id: string,
    currentUserId: string,
  ): Promise<BuildWithSkills> {
    const build = await this.prisma.build.findFirst({
      where: { id, userId: currentUserId },
      include: WITH_SKILLS,
    });

    if (!build) {
      throw new NotFoundException(NOT_FOUND);
    }

    return build;
  }

  private async assertLegal(draft: BuildDraft): Promise<void> {
    const catalog = await this.prisma.skill.findMany({
      where: { code: { in: draft.skillCodes } },
    });
    const violations = validateBuild(draft, catalog);

    if (violations.length > 0) {
      throw new BadRequestException({
        message: 'The build breaks the rules of the arena',
        violations,
      });
    }
  }
}

function connectByCode(codes: string[]) {
  return codes.map((code) => ({ skill: { connect: { code } } }));
}

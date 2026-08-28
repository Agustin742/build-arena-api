import { ConflictException, Injectable } from '@nestjs/common';
import { hash } from 'bcrypt';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../user/user.mapper';
import type { PublicUser } from '../user/user.mapper';
import type { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          passwordHash,
        },
      });

      return toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException('Email or username is already taken');
      }

      throw error;
    }
  }
}

import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';

import type { User } from '../generated/prisma/client';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../user/user.mapper';
import type { PublicUser } from '../user/user.mapper';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import type { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';
import type { TokenPair } from './token.service';

const BCRYPT_ROUNDS = 12;
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';
const ABSENT_USER_HASH =
  '$2b$12$jR.Jdh7YfnoqEtN/GsP5/O/yJxXDQedqFYK8G5xDM2WLBubWj9eT.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
  ) {}

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

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const passwordMatches = await compare(
      dto.password,
      user?.passwordHash ?? ABSENT_USER_HASH,
    );

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.startSession(user);
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const user = await this.loadSessionOwner(dto.refreshToken);

    return this.startSession(user);
  }

  async logout(dto: RefreshDto): Promise<void> {
    const user = await this.loadSessionOwner(dto.refreshToken);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: null },
    });
  }

  private async startSession(user: User): Promise<TokenPair> {
    const pair = await this.tokens.issuePair(user.id, user.username);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.tokens.fingerprint(pair.refreshToken) },
    });

    return pair;
  }

  private async loadSessionOwner(refreshToken: string): Promise<User> {
    const payload = await this.tokens.readRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (
      !user?.refreshTokenHash ||
      !this.tokens.matchesFingerprint(refreshToken, user.refreshTokenHash)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return user;
  }
}

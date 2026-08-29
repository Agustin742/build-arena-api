import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcrypt';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

type CreateArgs = {
  data: { email: string; username: string; passwordHash: string };
};

type UpdateArgs = {
  where: { id: string };
  data: { refreshTokenHash: string | null };
};

const password = 'a-long-enough-password';

const dto: RegisterDto = {
  email: 'sylas@buildarena.dev',
  username: 'sylas',
  password,
};

describe('AuthService', () => {
  let create: jest.Mock;
  let update: jest.Mock;
  let findUnique: jest.Mock;
  let tokens: TokenService;
  let service: AuthService;
  let storedUser: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    refreshTokenHash: string | null;
    rating: number;
    createdAt: Date;
    updatedAt: Date;
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'access-secret-for-tests';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret-for-tests';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_EXPIRES_IN = '7d';
  });

  beforeEach(async () => {
    storedUser = {
      id: 'e2f9b3c4-0000-4000-8000-000000000001',
      email: dto.email,
      username: dto.username,
      passwordHash: await hash(password, 4),
      refreshTokenHash: null,
      rating: 1200,
      createdAt: new Date('2026-08-28T00:00:00.000Z'),
      updatedAt: new Date('2026-08-28T00:00:00.000Z'),
    };

    create = jest.fn().mockResolvedValue(storedUser);
    update = jest.fn().mockImplementation((args: UpdateArgs) => {
      storedUser.refreshTokenHash = args.data.refreshTokenHash;
      return Promise.resolve(storedUser);
    });
    findUnique = jest
      .fn()
      .mockImplementation(() => Promise.resolve(storedUser));

    tokens = new TokenService(new JwtService({}));
    service = new AuthService(
      { user: { create, update, findUnique } } as unknown as PrismaService,
      tokens,
    );
  });

  describe('register', () => {
    it('hashes the password before persisting it', async () => {
      await service.register(dto);

      const calls = create.mock.calls as [CreateArgs][];
      const persisted = calls[0][0];

      expect(persisted.data).not.toHaveProperty('password');
      expect(persisted.data.passwordHash).not.toBe(password);
      await expect(
        compare(password, persisted.data.passwordHash),
      ).resolves.toBe(true);
    });

    it('never returns the password hash', async () => {
      const result = await service.register(dto);

      expect(result).toEqual({
        id: storedUser.id,
        email: storedUser.email,
        username: storedUser.username,
        rating: storedUser.rating,
        createdAt: storedUser.createdAt,
      });
    });

    it('rejects an email or username that is already taken', async () => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.10.0',
        }),
      );

      await expect(service.register(dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('lets unexpected database errors through', async () => {
      create.mockRejectedValue(new Error('connection lost'));

      await expect(service.register(dto)).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    it('issues a token pair for valid credentials', async () => {
      const pair = await service.login({ email: dto.email, password });

      expect(pair.accessToken).toEqual(expect.any(String));
      expect(pair.refreshToken).toEqual(expect.any(String));
    });

    it('stores the fingerprint of the refresh token, never the token', async () => {
      const pair = await service.login({ email: dto.email, password });

      expect(storedUser.refreshTokenHash).not.toBe(pair.refreshToken);
      expect(
        tokens.matchesFingerprint(
          pair.refreshToken,
          storedUser.refreshTokenHash as string,
        ),
      ).toBe(true);
    });

    it('rejects an unknown email', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ghost@buildarena.dev', password }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a wrong password', async () => {
      await expect(
        service.login({ email: dto.email, password: 'not-the-password' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token', async () => {
      const first = await service.login({ email: dto.email, password });
      const second = await service.refresh({
        refreshToken: first.refreshToken,
      });

      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(
        tokens.matchesFingerprint(
          second.refreshToken,
          storedUser.refreshTokenHash as string,
        ),
      ).toBe(true);
    });

    it('rejects a refresh token that was already rotated', async () => {
      const first = await service.login({ email: dto.email, password });
      await service.refresh({ refreshToken: first.refreshToken });

      await expect(
        service.refresh({ refreshToken: first.refreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a forged refresh token', async () => {
      await expect(
        service.refresh({ refreshToken: 'not.a.token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('profile', () => {
    it('returns the public profile of the authenticated user', async () => {
      await expect(service.profile(storedUser.id)).resolves.toEqual({
        id: storedUser.id,
        email: storedUser.email,
        username: storedUser.username,
        rating: storedUser.rating,
        createdAt: storedUser.createdAt,
      });
    });

    it('rejects a token whose user no longer exists', async () => {
      findUnique.mockResolvedValue(null);

      await expect(service.profile(storedUser.id)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('logout', () => {
    it('clears the stored refresh token', async () => {
      const pair = await service.login({ email: dto.email, password });

      await service.logout({ refreshToken: pair.refreshToken });

      expect(storedUser.refreshTokenHash).toBeNull();
    });

    it('rejects a refresh token that no longer matches', async () => {
      const pair = await service.login({ email: dto.email, password });
      await service.logout({ refreshToken: pair.refreshToken });

      await expect(
        service.logout({ refreshToken: pair.refreshToken }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});

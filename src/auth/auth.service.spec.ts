import { ConflictException } from '@nestjs/common';
import { compare } from 'bcrypt';

import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { RegisterDto } from './dto/register.dto';

type CreateArgs = {
  data: { email: string; username: string; passwordHash: string };
};

type UserCreate = jest.Mock;

describe('AuthService', () => {
  const dto: RegisterDto = {
    email: 'sylas@buildarena.dev',
    username: 'sylas',
    password: 'a-long-enough-password',
  };

  let create: UserCreate;
  let service: AuthService;

  const storedUser = {
    id: 'e2f9b3c4-0000-4000-8000-000000000001',
    email: dto.email,
    username: dto.username,
    passwordHash: 'irrelevant',
    refreshTokenHash: null,
    rating: 1200,
    createdAt: new Date('2026-08-28T00:00:00.000Z'),
    updatedAt: new Date('2026-08-28T00:00:00.000Z'),
  };

  beforeEach(() => {
    create = jest.fn().mockResolvedValue(storedUser);
    service = new AuthService({ user: { create } } as unknown as PrismaService);
  });

  it('hashes the password before persisting it', async () => {
    await service.register(dto);

    const calls = create.mock.calls as [CreateArgs][];
    const persisted = calls[0][0];

    expect(persisted.data).not.toHaveProperty('password');
    expect(persisted.data.passwordHash).not.toBe(dto.password);
    await expect(
      compare(dto.password, persisted.data.passwordHash),
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

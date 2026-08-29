import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

import { requireEnv } from '../common/env';

export type AccessTokenPayload = {
  sub: string;
  username: string;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

function lifetime(name: string): JwtSignOptions['expiresIn'] {
  return requireEnv(name) as JwtSignOptions['expiresIn'];
}

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  async issuePair(userId: string, username: string): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, username } satisfies AccessTokenPayload,
        {
          secret: requireEnv('JWT_SECRET'),
          expiresIn: lifetime('JWT_ACCESS_EXPIRES_IN'),
        },
      ),
      this.jwt.signAsync(
        { sub: userId, jti: randomUUID() } satisfies RefreshTokenPayload,
        {
          secret: requireEnv('JWT_REFRESH_SECRET'),
          expiresIn: lifetime('JWT_REFRESH_EXPIRES_IN'),
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async readRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: requireEnv('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  fingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  matchesFingerprint(token: string, storedFingerprint: string): boolean {
    const candidate = Buffer.from(this.fingerprint(token));
    const stored = Buffer.from(storedFingerprint);

    if (candidate.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(candidate, stored);
  }
}

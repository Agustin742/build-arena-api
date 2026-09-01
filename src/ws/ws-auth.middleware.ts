import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import { requireEnv } from '../common/env';
import type { AccessTokenPayload } from '../auth/token.service';
import type { SocketData } from './battle-events';

export type WsAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void,
) => Promise<void>;

/**
 * Socket.IO server-level middleware, installed in `afterInit` — it runs
 * before `handleConnection`, so a tokenless or invalid-token socket never
 * exists. "No valid token, no room, ever" is structural, not a first-line
 * guard a future handler could forget.
 *
 * Reads `handshake.auth.token` only — not the `Authorization` header, not a
 * query parameter. One location is one thing to audit.
 */
export function createWsAuthMiddleware(jwt: JwtService): WsAuthMiddleware {
  return async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      next(new Error('Unauthorized'));
      return;
    }

    try {
      const payload = await jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: requireEnv('JWT_SECRET'),
      });

      (socket.data as SocketData).user = {
        id: payload.sub,
        username: payload.username,
      };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  };
}

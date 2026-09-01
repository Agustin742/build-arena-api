import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { AccessTokenPayload } from '../auth/token.service';
import type { SocketData } from './battle-events';
import { createWsAuthMiddleware } from './ws-auth.middleware';

const payload: AccessTokenPayload = {
  sub: '11111111-0000-4000-8000-000000000001',
  username: 'ada',
};

/** Hand-built fake socket, per the repo's convention — no `TestingModule`. */
const fakeSocket = (token?: string): Socket => {
  const data: Partial<SocketData> = {};

  return {
    handshake: { auth: token === undefined ? {} : { token } },
    data,
  } as unknown as Socket;
};

describe('createWsAuthMiddleware', () => {
  let jwt: JwtService;

  beforeAll(() => {
    process.env.JWT_SECRET = 'access-secret-for-tests';
  });

  beforeEach(() => {
    jwt = new JwtService({});
  });

  it('attaches socket.data.user for a valid token', async () => {
    const token = await jwt.signAsync(payload, {
      secret: 'access-secret-for-tests',
      expiresIn: '15m',
    });
    const socket = fakeSocket(token);
    const next = jest.fn();
    const middleware = createWsAuthMiddleware(jwt);

    await middleware(socket, next);

    expect((socket.data as SocketData).user).toEqual({
      id: payload.sub,
      username: payload.username,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a connection with no token at all', async () => {
    const socket = fakeSocket(undefined);
    const next = jest.fn();
    const middleware = createWsAuthMiddleware(jwt);

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect((socket.data as SocketData).user).toBeUndefined();
  });

  it('rejects a malformed token', async () => {
    const socket = fakeSocket('not-a-well-formed-jwt');
    const next = jest.fn();
    const middleware = createWsAuthMiddleware(jwt);

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects a token with an invalid signature', async () => {
    const token = await jwt.signAsync(payload, {
      secret: 'a-different-secret',
      expiresIn: '15m',
    });
    const socket = fakeSocket(token);
    const next = jest.fn();
    const middleware = createWsAuthMiddleware(jwt);

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync(payload, {
      secret: 'access-secret-for-tests',
      expiresIn: '-1s',
    });
    const socket = fakeSocket(token);
    const next = jest.fn();
    const middleware = createWsAuthMiddleware(jwt);

    await middleware(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

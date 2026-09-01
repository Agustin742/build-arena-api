import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { SocketData } from './battle-events';
import { createWsAuthMiddleware } from './ws-auth.middleware';

/**
 * Transport skeleton for this slice. The handshake middleware installed in
 * `afterInit` is the entire authorization boundary so far — a tokenless or
 * invalid-token socket never reaches `handleConnection`. Room joins,
 * message handlers, and emission arrive in later slices.
 */
@WebSocketGateway()
export class BattleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(BattleGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(private readonly jwt: JwtService) {}

  afterInit(server: Server): void {
    const authenticate = createWsAuthMiddleware(this.jwt);

    // `server.use()` expects a void-returning callback; the middleware
    // itself is async, so it is invoked rather than passed directly.
    server.use((socket, next) => {
      void authenticate(socket, next);
    });
  }

  handleConnection(socket: Socket): void {
    const { user } = socket.data as SocketData;
    this.logger.debug(`Socket connected: ${user.id}`);
  }

  handleDisconnect(socket: Socket): void {
    const { user } = socket.data as SocketData;
    this.logger.debug(`Socket disconnected: ${user.id}`);
  }
}

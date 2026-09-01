import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { BattleJoinPayload, SocketData } from './battle-events';
import { ClientEvent, ServerEvent } from './battle-events';
import { BattleSessionService } from './battle-session.service';
import { createWsAuthMiddleware } from './ws-auth.middleware';

/** The one room a battle's two participants ever share. */
const battleRoom = (battleId: string): string => `battle:${battleId}`;

/**
 * Transport only: the handshake middleware installed in `afterInit` is the
 * connection-level boundary — a tokenless or invalid-token socket never
 * reaches `handleConnection`. `battle:join` is the message-level boundary:
 * it re-reads participation from the database before granting room
 * membership, never from anything the client claims. Turn resolution and
 * the action/reaction handlers arrive in later slices.
 */
@WebSocketGateway()
export class BattleGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(BattleGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly session: BattleSessionService,
  ) {}

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

  /**
   * Admits the sender to `battle:{battleId}` only once `BattleSessionService`
   * confirms participation and status from the database. A non-participant
   * and a non-existent battle both reach this the same way — `admitJoin`
   * never learns which — so both receive the identical generic refusal.
   */
  @SubscribeMessage(ClientEvent.JOIN)
  async handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: BattleJoinPayload,
  ): Promise<void> {
    const { user } = socket.data as SocketData;
    const result = await this.session.admitJoin(payload.battleId, user.id);

    if (!result.ok) {
      socket.emit(ServerEvent.ERROR, {
        ...result.denial,
        event: ClientEvent.JOIN,
      });
      return;
    }

    await socket.join(battleRoom(payload.battleId));
    socket.emit(ServerEvent.STATE, this.session.toStatePayload(result.row));
  }
}

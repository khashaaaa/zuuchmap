import { Inject, Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { SocketEvent } from '@zuuchmap/core';
import { DataSource } from 'typeorm';
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth.config';
import { authenticateToken } from '../auth/request-user';
import type { RealtimePort } from './realtime';

@WebSocketGateway({ transports: ['websocket'], cors: { origin: true } })
export class EventsGateway implements OnGatewayConnection, RealtimePort {
  private readonly log = new Logger(EventsGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
    private readonly ds: DataSource,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const auth = client.handshake.auth as Record<string, unknown>;
    const token = typeof auth.token === 'string' ? auth.token : undefined;
    // The same check as HTTP: a signed-out or deleted session cannot listen, admin is ADMIN_PHONES.
    const user = token ? await authenticateToken(token, this.cfg, this.ds).catch(() => null) : null;
    if (!user) {
      this.log.debug('rejecting unauthenticated socket');
      client.disconnect(true);
      return;
    }
    await client.join(`user:${user.id}`);
    if (user.is_admin) await client.join('admin');
  }

  toUser(userId: string, event: SocketEvent, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}

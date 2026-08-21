import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { isAdmin } from '../admin/admin.guard';
import { jwtSecret } from '../utils/jwt-secret';

@WebSocketGateway({
  cors: { origin: process.env.ALLOWED_ORIGIN ?? 'https://zuuchmap.com', credentials: true },
  namespace: '/events',
  path: '/engine/socket.io',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    if (!token) return;
    try {
      const payload = this.jwtService.verify(token, {
        secret: jwtSecret(),
      });
      client.data.userId = payload.sub;
      client.data.isAdmin = isAdmin(payload.phone);
    } catch {
      // Invalid/expired token: tell the client so it can stop retrying with the
      // same credentials, then drop it. A server-initiated disconnect is not
      // auto-reconnected by socket.io-client, so this can't loop.
      client.emit('auth_error', { reason: 'invalid_token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {}

  // Returns an ack (when the client passes a callback) so a rejected join is
  // visible client-side instead of silently delivering nothing.
  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    if (typeof room !== 'string' || room.length >= 100) {
      return { ok: false, reason: 'invalid_room' };
    }

    if (room === 'admin') {
      if (!client.data?.isAdmin) return { ok: false, reason: 'unauthorized' };
    } else if (room.startsWith('provider:')) {
      if (client.data?.userId !== room.slice('provider:'.length)) {
        return { ok: false, reason: 'unauthorized' };
      }
    }

    client.join(room);
    return { ok: true };
  }

  private emit(room: string, event: string, data?: unknown) {
    try {
      if (!this.server) return;
      this.server.to(room).emit(event, data);
    } catch {}
  }

  emitPostCreated(post: { id: number; category: string; title?: string }) {
    this.emit('admin', 'post.created', post);
  }

  emitPostApproved(postId: number, userId: string, title?: string) {
    this.emit('admin', 'post.approved', { postId, title });
    this.emit(`provider:${userId}`, 'post.approved', { postId, title });
  }

  emitPostRejected(postId: number, userId: string, reason: string, title?: string) {
    this.emit('admin', 'post.rejected', { postId, reason, title });
    this.emit(`provider:${userId}`, 'post.rejected', { postId, reason, title });
  }

  emitStatsUpdated() {
    this.emit('admin', 'stats.updated');
  }

  // Booking lifecycle — delivered to the affected user's personal room
  emitBookingEvent(userId: string, event: string, data?: unknown) {
    this.emit(`provider:${userId}`, event, data);
  }

}

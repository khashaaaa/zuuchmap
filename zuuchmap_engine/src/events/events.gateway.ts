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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isAdmin } from '../admin/admin.guard';
import { jwtSecret } from '../utils/jwt-secret';

// Socket event contract. Mirrored in zuuchmap_web/src/lib/socket.js and
// zuuchmap_app/src/services/socketService.js — change all three together.
// Per-user payloads use { postId, category, title } — never `id`/`post_type`.
export const SOCKET_EVENTS = {
  POST_CREATED: 'post.created',
  POST_APPROVED: 'post.approved',
  POST_REJECTED: 'post.rejected',
  STATS_UPDATED: 'stats.updated',
  BOOKING_REQUESTED: 'booking.requested',
  BOOKING_RESPONDED: 'booking.responded',
  BOOKING_CANCELLED: 'booking.cancelled',
  MESSAGE_CREATED: 'message.created',
  REPORT_CREATED: 'report.created',
  AUTH_ERROR: 'auth_error',
} as const;

export const ROOM_ADMIN = 'admin';
export const USER_ROOM_PREFIX = 'user:';
// Pre-rename app builds still join `provider:<id>` — accept their joins and
// double-emit per-user events until those builds are gone, then delete this.
export const LEGACY_USER_ROOM_PREFIX = 'provider:';
export const userRoom = (userId: string) => `${USER_ROOM_PREFIX}${userId}`;

@WebSocketGateway({
  cors: {
    origin: process.env.ALLOWED_ORIGIN ?? 'https://zuuchmap.com',
    credentials: true,
  },
  namespace: '/events',
  path: '/engine/socket.io',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token;
    // No events are ever delivered to an unauthenticated socket, so don't let
    // one idle here — reject it the same way as a bad token.
    if (!token) {
      client.emit(SOCKET_EVENTS.AUTH_ERROR, { reason: 'missing_token' });
      client.disconnect(true);
      return;
    }
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
      client.emit(SOCKET_EVENTS.AUTH_ERROR, { reason: 'invalid_token' });
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket) {}

  // Returns an ack (when the client passes a callback) so a rejected join is
  // visible client-side instead of silently delivering nothing. Only the admin
  // room and the caller's own user room are joinable — arbitrary room names
  // would allocate server memory for rooms nothing ever emits to.
  @SubscribeMessage('join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() room: string) {
    if (typeof room !== 'string' || room.length >= 100) {
      return { ok: false, reason: 'invalid_room' };
    }

    if (room === ROOM_ADMIN) {
      if (!client.data?.isAdmin) return { ok: false, reason: 'unauthorized' };
    } else {
      const prefix = [USER_ROOM_PREFIX, LEGACY_USER_ROOM_PREFIX].find((p) =>
        room.startsWith(p),
      );
      if (!prefix) return { ok: false, reason: 'invalid_room' };
      if (client.data?.userId !== room.slice(prefix.length)) {
        return { ok: false, reason: 'unauthorized' };
      }
    }

    client.join(room);
    return { ok: true };
  }

  private emit(room: string, event: string, data?: unknown) {
    if (!this.server) {
      // Before the adapter is up there is nothing to emit to. Worth saying once
      // per event rather than never: a silent no-op here is realtime quietly
      // not working, which is indistinguishable from "nothing happened".
      this.logger.warn(
        `Dropped ${event} for ${room} — gateway server not ready`,
      );
      return;
    }
    try {
      this.server.to(room).emit(event, data);
    } catch (err: any) {
      // An emit must never take down the request that triggered it, but it must
      // not vanish either — clients silently stop receiving updates otherwise.
      this.logger.warn(`Emit ${event} to ${room} failed: ${err?.message}`);
    }
  }

  private emitToUser(userId: string, event: string, data?: unknown) {
    this.emit(userRoom(userId), event, data);
    this.emit(`${LEGACY_USER_ROOM_PREFIX}${userId}`, event, data);
  }

  emitPostCreated(post: { id: number; category: string; title?: string }) {
    this.emit(ROOM_ADMIN, SOCKET_EVENTS.POST_CREATED, {
      postId: post.id,
      category: post.category,
      title: post.title,
    });
  }

  emitPostApproved(
    postId: number,
    userId: string,
    title?: string,
    category?: string,
  ) {
    const payload = { postId, title, category };
    this.emit(ROOM_ADMIN, SOCKET_EVENTS.POST_APPROVED, payload);
    this.emitToUser(userId, SOCKET_EVENTS.POST_APPROVED, payload);
  }

  emitPostRejected(
    postId: number,
    userId: string,
    reason: string,
    title?: string,
    category?: string,
  ) {
    const payload = { postId, reason, title, category };
    this.emit(ROOM_ADMIN, SOCKET_EVENTS.POST_REJECTED, payload);
    this.emitToUser(userId, SOCKET_EVENTS.POST_REJECTED, payload);
  }

  emitStatsUpdated() {
    this.emit(ROOM_ADMIN, SOCKET_EVENTS.STATS_UPDATED);
  }

  // Booking lifecycle — delivered to the affected user's personal room
  emitBookingEvent(userId: string, event: string, data?: unknown) {
    this.emitToUser(userId, event, data);
  }

  /**
   * A new chat message, to the recipient only. The sender already has it —
   * echoing it back would race the optimistic row the sender's client renders.
   */
  emitMessage(
    recipientId: string,
    payload: {
      conversationId: string;
      messageId: string;
      postId: number | null;
      senderId: string;
      preview: string;
    },
  ) {
    this.emitToUser(recipientId, SOCKET_EVENTS.MESSAGE_CREATED, payload);
  }

  /** A listing was flagged. Admin-only — the reported provider is not told. */
  emitReportCreated(payload: {
    reportId: string;
    postId: number;
    reason: string;
  }) {
    this.emit(ROOM_ADMIN, SOCKET_EVENTS.REPORT_CREATED, payload);
  }
}

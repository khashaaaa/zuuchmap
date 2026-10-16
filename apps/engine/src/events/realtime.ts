import type { SocketEvent } from '@zuuchmap/core';

export const REALTIME = Symbol('REALTIME');

/** Server-to-client push over the socket, to one account's room. Absent in tests: inject it `@Optional()`. */
export interface RealtimePort {
  toUser(userId: string, event: SocketEvent, payload: unknown): void;
}

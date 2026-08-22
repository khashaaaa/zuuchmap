import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createRedis } from './redis';

/**
 * Socket.io adapter backed by Redis pub/sub, so an event emitted on one pm2
 * instance reaches clients connected to any other instance. Without it, a
 * `user:<id>` room only exists on the worker that client happens to be
 * pinned to, and cross-worker emits silently vanish.
 *
 * Only installed when Redis is configured (see main.ts); single-node dev keeps
 * the default in-memory adapter.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  connectToRedis(): void {
    const pub = createRedis('socket-pub');
    const sub = pub.duplicate();
    this.adapterConstructor = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}

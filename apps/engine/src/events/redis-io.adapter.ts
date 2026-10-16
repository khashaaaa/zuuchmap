import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/** Shares rooms (`user:<id>`, `admin`) across pm2 workers through Redis pub/sub. */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  connect(url: string): void {
    const pub = new Redis(url);
    const sub = pub.duplicate();
    pub.on('error', () => undefined);
    sub.on('error', () => undefined);
    this.adapterConstructor = createAdapter(pub, sub);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options) as { adapter: (a: unknown) => void };
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}

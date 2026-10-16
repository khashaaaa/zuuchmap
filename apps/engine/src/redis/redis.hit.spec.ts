import { RedisService } from './redis.service';

describe('RedisService.hit (in-memory fallback)', () => {
  it('counts within a window and restarts after it lapses', async () => {
    const r = new RedisService(undefined);
    expect(await r.hit('k', 60)).toBe(1);
    expect(await r.hit('k', 60)).toBe(2);
    expect(await r.hit('other', 60)).toBe(1);
    await new Promise((res) => setTimeout(res, 80));
    expect(await r.hit('k', 60)).toBe(1);
  });
});

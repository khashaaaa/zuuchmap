import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

jest.mock('../utils/redis', () => ({
  redisStatus: jest.fn(() => ({ ok: true, detail: 'not configured' })),
}));

const redis = require('../utils/redis');

/**
 * The state this exists to catch is "process up, database unusable" — pm2 sees
 * a healthy process, every real route 500s, and nothing alerts. A probe that
 * hangs alongside the pool it is probing would be no better than no probe.
 */
describe('HealthService', () => {
  const makeService = (dataSource: any) => new HealthService(dataSource);

  beforeEach(() => {
    jest.clearAllMocks();
    redis.redisStatus.mockReturnValue({ ok: true, detail: 'not configured' });
  });

  it('reports live without touching the database', async () => {
    const query = jest.fn();
    const svc = makeService({ isInitialized: true, query });
    expect(svc.liveness()).toMatchObject({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });

  it('reports ready when the database answers', async () => {
    const svc = makeService({
      isInitialized: true,
      query: jest.fn(async () => [{ '?column?': 1 }]),
    });
    await expect(svc.readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: { ok: true } },
    });
  });

  it('answers 503 — not a cheerful 200 — when the database is down', async () => {
    const svc = makeService({
      isInitialized: true,
      query: jest.fn(async () => {
        throw new Error('pool exhausted');
      }),
    });
    await expect(svc.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // The exhausted-pool case: the query is accepted and never returns. Awaiting
  // it would hang the probe too, so a hang has to be read as a failure.
  it('treats a query that never returns as a failure', async () => {
    jest.useFakeTimers();
    const svc = makeService({
      isInitialized: true,
      query: jest.fn(() => new Promise(() => {})),
    });
    const pending = svc.readiness().catch((e) => e);
    jest.advanceTimersByTime(2500);
    await expect(pending).resolves.toBeInstanceOf(ServiceUnavailableException);
    jest.useRealTimers();
  });

  it('fails readiness before the connection is even initialised', async () => {
    const svc = makeService({ isInitialized: false, query: jest.fn() });
    await expect(svc.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  // Redis is optional by design; "not configured" is a healthy single-instance
  // deployment, not a degradation.
  it('stays ready when Redis is deliberately absent', async () => {
    const svc = makeService({
      isInitialized: true,
      query: jest.fn(async () => []),
    });
    await expect(svc.readiness()).resolves.toMatchObject({ status: 'ok' });
  });

  it('degrades when a configured Redis is not connected', async () => {
    redis.redisStatus.mockReturnValue({
      ok: false,
      detail: 'cache-pub:reconnecting',
    });
    const svc = makeService({
      isInitialized: true,
      query: jest.fn(async () => []),
    });
    await expect(svc.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

import { HttpException } from '@nestjs/common';
import type { AuthConfig } from './auth.config';
import { VerifyMnService } from './verify-mn.service';

const cfg = (apiKey?: string): AuthConfig =>
  ({ verifyMn: { apiKey, baseUrl: 'https://verify.test', timeoutMs: 1000 } }) as unknown as AuthConfig;

describe('VerifyMnService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is inert without an API key and never calls out', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const s = new VerifyMnService(cfg());
    expect(s.enabled).toBe(false);
    await expect(s.createSession('99112233', '123456', 'cb')).rejects.toMatchObject({ status: 503 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('registers a session with the bearer key', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ sessionId: 's1', shortcode: '144773' }), { status: 200 }));
    const s = new VerifyMnService(cfg('k'));
    expect(s.enabled).toBe(true);
    await expect(s.createSession('99112233', '123456', 'cb')).resolves.toMatchObject({ sessionId: 's1' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://verify.test/sessions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it.each([
    [401, 503],
    [404, 404],
    [429, 429],
    [500, 502],
  ])('maps upstream %i to %i', async (up, mine) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: up }));
    const err = await new VerifyMnService(cfg('k')).getStatus('s').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(mine);
  });
});

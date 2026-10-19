import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/core/config/env', () => ({ env: { apiUrl: 'https://api.example.test/api' } }));
import { configureSession, request } from '@/core/api/client';

afterEach(() => {
  vi.unstubAllGlobals();
  configureSession(null);
});
describe('authenticated HTTP client', () => {
  it('includes bearer token in protected requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    configureSession('jwt');
    await request('/deliveries/driver');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer jwt');
  });
  it('does not attach the old token or expire a session for a rejected login', async () => {
    const expired = vi.fn();
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    configureSession('old', expired);
    await expect(request('/auth/login', { method: 'POST' }, false)).rejects.toThrow('credenciais');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect(expired).not.toHaveBeenCalled();
  });
  it('expires the session on protected 401', async () => {
    const expired = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    configureSession('jwt', expired);
    await expect(request('/deliveries/driver')).rejects.toThrow('expirou');
    expect(expired).toHaveBeenCalledOnce();
  });
  it('does not expire a newer session when an old request fails', async () => {
    const expired = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        configureSession('new', expired);
        return new Response('{}', { status: 401 });
      }),
    );
    configureSession('old', expired);
    await expect(request('/deliveries/driver')).rejects.toThrow();
    expect(expired).not.toHaveBeenCalled();
  });
});

describe('session renewal', () => {
  it('refreshes once for concurrent 401 responses and retries with the new bearer', async () => {
    const expired = vi.fn();
    const refresh = vi.fn(async () => 'renewed');
    const fetcher = vi.fn(
      async (_url: string, options: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status:
            (options.headers as Record<string, string>).Authorization === 'Bearer renewed'
              ? 200
              : 401,
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    configureSession('old', expired, refresh);
    expect(
      await Promise.all([request('/entregas/motorista'), request('/alertas/motorista')]),
    ).toEqual([{ ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(expired).not.toHaveBeenCalled();
  });
  it('expires a revoked refresh token but preserves the session during network errors', async () => {
    const { ApiError } = await import('@/core/api/client');
    const expired = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    configureSession('old', expired, async () => {
      throw new ApiError('offline', 0);
    });
    await expect(request('/entregas/motorista')).rejects.toThrow('offline');
    expect(expired).not.toHaveBeenCalled();
    configureSession('old', expired, async () => {
      throw new ApiError('revoked', 401);
    });
    await expect(request('/entregas/motorista')).rejects.toThrow('revoked');
    expect(expired).toHaveBeenCalledOnce();
  });
  it('discards a renewal when the account changes before it finishes', async () => {
    const expired = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    configureSession('old', expired, async () => {
      configureSession('other-account', expired);
      return 'stale';
    });
    await expect(request('/entregas/motorista')).rejects.toThrow('Sessão alterada');
    expect(expired).not.toHaveBeenCalled();
  });
  it('does not retry forever if a renewed token is still rejected', async () => {
    const expired = vi.fn(),
      refresh = vi.fn(async () => 'renewed');
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    configureSession('old', expired, refresh);
    await expect(request('/entregas/motorista')).rejects.toThrow('expirou');
    expect(refresh).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledOnce();
  });
});

import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  configure: vi.fn(),
  foreground: undefined as undefined | ((state: string) => void),
}));
vi.mock('@/core/config/env', () => ({ env: { apiUrl: 'https://api.example.test/api' } }));
vi.mock('@/features/tracking/runtime', () => ({ stopTracking: async () => {} }));
vi.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, callback: (state: string) => void) => {
      mocks.foreground = callback;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock('@/core/storage/session-storage', () => ({
  sessionStorage: { read: mocks.read, write: mocks.write, clear: mocks.clear },
}));
vi.mock('@/features/auth/service', () => ({
  login: mocks.login,
  refreshLogin: mocks.refresh,
  logoutRemote: mocks.logout,
}));
vi.mock('@/core/api/client', async (original) => ({
  ...(await original<typeof import('@/core/api/client')>()),
  configureSession: mocks.configure,
}));
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';

let auth: ReturnType<typeof useAuth>;
let renderer: ReactTestRenderer | undefined;
let client: QueryClient;
function Probe() {
  auth = useAuth();
  return null;
}
const session = () => ({
  accessToken: `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.x`,
  user: { id: 1, email: 'joao@koda.com', role: 'driver', name: 'João', is_active: true },
  expiresAt: Date.now() + 3600000,
});
async function mount() {
  client = new QueryClient();
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.read.mockResolvedValue(null);
  mocks.write.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  mocks.logout.mockResolvedValue(undefined);
  mocks.login.mockResolvedValue(session());
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useAuth session lifecycle', () => {
  it('restores a valid persisted driver and configures bearer requests', async () => {
    const saved = session();
    mocks.read.mockResolvedValue(JSON.stringify(saved));
    await mount();
    expect(auth.loading).toBe(false);
    expect(auth.session?.user.id).toBe(1);
    expect(mocks.configure).toHaveBeenLastCalledWith(
      saved.accessToken,
      expect.any(Function),
      undefined,
    );
  });
  it('does not authenticate if secure storage fails', async () => {
    await mount();
    mocks.write.mockRejectedValueOnce(new Error('Keychain unavailable'));
    await act(async () => {
      await expect(auth.signIn({ email: 'joao@koda.com', password: 'pw' })).rejects.toThrow(
        'Keychain',
      );
    });
    expect(auth.session).toBeNull();
  });
  it('clears storage, bearer token and trip cache on logout', async () => {
    await mount();
    await act(async () => {
      await auth.signIn({ email: 'joao@koda.com', password: 'pw' });
    });
    client.setQueryData(['trips', 1], ['private trip']);
    await act(async () => {
      await auth.signOut();
    });
    expect(auth.session).toBeNull();
    expect(client.getQueryData(['trips', 1])).toBeUndefined();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.configure).toHaveBeenLastCalledWith(null);
  });
  it('expires immediately when returning from background with an expired token', async () => {
    await mount();
    const next = session();
    mocks.login.mockResolvedValue(next);
    await act(async () => {
      await auth.signIn({ email: 'joao@koda.com', password: 'pw' });
    });
    vi.spyOn(Date, 'now').mockReturnValueOnce(next.expiresAt + 1);
    await act(async () => {
      mocks.foreground?.('active');
    });
    expect(auth.session).toBeNull();
    expect(auth.notice).toContain('expirou');
    vi.restoreAllMocks();
  });
  it('does not resurrect a session when login resolves after logout', async () => {
    await mount();
    let resolve!: (value: ReturnType<typeof session>) => void;
    mocks.login.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let signingIn: Promise<void>;
    await act(async () => {
      signingIn = auth.signIn({ email: 'joao@koda.com', password: 'pw' });
    });
    await act(async () => {
      await auth.signOut();
      resolve(session());
      await signingIn;
    });
    expect(auth.session).toBeNull();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

it('renews an expired stored access token before restoring protected routes', async () => {
  const stored = {
    ...session(),
    accessToken: `e30.${btoa(JSON.stringify({ exp: 1 }))}.x`,
    refreshToken: session().accessToken,
  };
  const renewed = { ...session(), refreshToken: stored.refreshToken };
  mocks.read.mockResolvedValue(JSON.stringify(stored));
  mocks.refresh.mockResolvedValueOnce(renewed);
  await mount();
  expect(mocks.refresh).toHaveBeenCalledWith(stored.refreshToken);
  expect(auth.session?.accessToken).toBe(renewed.accessToken);
  expect(mocks.write).toHaveBeenCalledWith(JSON.stringify(renewed));
  expect(mocks.configure).toHaveBeenLastCalledWith(
    renewed.accessToken,
    expect.any(Function),
    expect.any(Function),
  );
});

it('does not restore an expired session when the renewal is rejected', async () => {
  const stored = {
    ...session(),
    accessToken: `e30.${btoa(JSON.stringify({ exp: 1 }))}.x`,
    refreshToken: session().accessToken,
  };
  mocks.read.mockResolvedValue(JSON.stringify(stored));
  mocks.refresh.mockRejectedValueOnce(new Error('revoked'));
  await mount();
  expect(auth.session).toBeNull();
  expect(auth.notice).toContain('restaurar');
});

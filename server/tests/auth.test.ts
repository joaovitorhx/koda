import { describe, expect, it, vi } from 'vitest';
import { createAuth } from '../src/auth';
const user = { id: 1, name: 'João', email: 'joao@koda.test', role: 'driver', is_active: true };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function cookieResponse() {
  const r = response({ user, message: 'Login realizado' });
  r.headers.append('Set-Cookie', 'access_token=access.jwt; HttpOnly; Path=/');
  r.headers.append('Set-Cookie', 'refresh_token=refresh.jwt; HttpOnly; Path=/');
  return r;
}
describe('Koda web authentication bridge', () => {
  it('uses the real /users/login cookies and validates /users/profile', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(cookieResponse())
      .mockResolvedValueOnce(response(user));
    const auth = createAuth('https://koda.test/api', fetcher);
    expect(await auth.login('joao@koda.test', 'password')).toEqual({
      user,
      accessToken: 'access.jwt',
      refreshToken: 'refresh.jwt',
    });
    expect(fetcher.mock.calls[0][0]).toBe('https://koda.test/api/users/login');
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer access.jwt');
  });
  it('refreshes with the existing backend cookie contract', async () => {
    const refreshed = response({ message: 'Token renovado' });
    refreshed.headers.append('Set-Cookie', 'access_token=new.jwt; HttpOnly');
    const fetcher = vi.fn().mockResolvedValueOnce(refreshed).mockResolvedValueOnce(response(user));
    const auth = createAuth('https://koda.test/api', fetcher);
    expect((await auth.refresh('refresh.jwt')).accessToken).toBe('new.jwt');
    expect(fetcher.mock.calls[0][1].headers.Cookie).toBe('refresh_token=refresh.jwt');
  });
  it('rejects operators and inactive drivers despite valid backend credentials', async () => {
    for (const profile of [
      { ...user, role: 'user' },
      { ...user, is_active: false },
    ]) {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(cookieResponse())
        .mockResolvedValueOnce(response(profile));
      await expect(
        createAuth('https://koda.test/api', fetcher).login(user.email, 'password'),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
  it('rejects invalid cookies without forwarding an injected header', async () => {
    const fetcher = vi.fn();
    await expect(
      createAuth('https://koda.test/api', fetcher).refresh('x; another=1'),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

import { z } from 'zod';
import { HttpError, requireDriver } from './contracts';
type Fetcher = typeof fetch;
function cookies(headers: Headers) {
  const values = headers.getSetCookie();
  const result: Record<string, string> = {};
  for (const cookie of values) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) result[pair.slice(0, index).trim()] = pair.slice(index + 1);
  }
  return result;
}
export function createAuth(baseUrl: string, fetcher: Fetcher = fetch) {
  const call = async (path: string, options: RequestInit) => {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        ...options,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new HttpError(503, 'A API Koda está indisponível. Tente novamente.');
    }
    if (!response.ok)
      throw new HttpError(
        response.status === 401 ? 401 : response.status === 403 ? 403 : 503,
        response.status === 401
          ? 'Verifique suas credenciais ou entre novamente.'
          : 'A API Koda não conseguiu concluir a operação.',
      );
    return response;
  };
  const profile = async (token: string) => {
    const response = await call('/users/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return requireDriver(await response.json());
  };
  const session = async (response: Response, oldRefresh?: string) => {
    const jar = cookies(response.headers);
    const body = (await response.json()) as Record<string, unknown>;
    const accessToken = z
      .string()
      .min(1)
      .parse(jar.access_token ?? body.accessToken);
    const refreshToken = z
      .string()
      .min(1)
      .parse(jar.refresh_token ?? body.refreshToken ?? oldRefresh);
    // Validate against the real profile on the same backend, never trust a decoded JWT alone.
    const user = await profile(accessToken);
    return { accessToken, refreshToken, user };
  };
  return {
    profile,
    login: async (email: string, password: string) =>
      session(
        await call('/users/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }),
      ),
    refresh: async (token: string) => {
      if (!/^[A-Za-z0-9_.-]+$/.test(token)) throw new HttpError(401, 'Sessão inválida.');
      return session(
        await call('/users/refresh', {
          method: 'POST',
          headers: { Cookie: `refresh_token=${token}`, 'Content-Type': 'application/json' },
          body: '{}',
        }),
        token,
      );
    },
    logout: async () => {
      await call('/users/logout', { method: 'POST' });
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;

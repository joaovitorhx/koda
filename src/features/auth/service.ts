import { request } from '@/core/api/client';
import { env } from '@/core/config/env';
import { type Credentials, driverSchema, requireDriver, parseLoginResponse } from './model';

export async function login(credentials: Credentials) {
  if (env.demo) {
    const { demoLogin } = await import('@/dev/demo');
    return parseLoginResponse(await demoLogin(credentials));
  }
  return parseLoginResponse(
    await request(
      env.loginPath,
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      },
      false,
    ),
  );
}

export async function refreshLogin(refreshToken: string) {
  return parseLoginResponse(
    await request(
      env.refreshPath,
      { method: 'POST', body: JSON.stringify({ refreshToken }) },
      false,
    ),
  );
}
export async function getProfile() {
  const user = driverSchema.parse(await request(env.profilePath));
  requireDriver(user);
  return user;
}
export async function logoutRemote() {
  if (!env.demo) await request(env.logoutPath, { method: 'POST' }, false);
}

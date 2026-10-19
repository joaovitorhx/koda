import { describe, expect, it } from 'vitest';
import { credentialsSchema, parseLoginResponse, restoreSession } from '@/features/auth/model';

const jwt = (exp = Math.floor(Date.now() / 1000) + 3600) =>
  `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ exp }))}.test`;
const driver = { id: 1, name: 'João', email: 'joao@koda.com', role: 'driver', is_active: true };
describe('driver authentication boundary', () => {
  it('accepts active drivers and derives expiry from JWT', () => {
    const accessToken = jwt();
    expect(parseLoginResponse({ accessToken, user: driver })).toMatchObject({
      accessToken,
      user: driver,
    });
  });
  it('rejects operators', () => {
    expect(() =>
      parseLoginResponse({ accessToken: jwt(), user: { ...driver, role: 'user' } }),
    ).toThrow('apenas para motoristas');
  });
  it('rejects inactive drivers and missing active flags', () => {
    expect(() =>
      parseLoginResponse({ accessToken: jwt(), user: { ...driver, is_active: false } }),
    ).toThrow('inativo');
    expect(() =>
      parseLoginResponse({ accessToken: jwt(), user: { ...driver, is_active: undefined } }),
    ).toThrow('inválida');
  });
  it.each(['bad-token', jwt(1), `e30.${btoa('{}')}.x`])(
    'rejects malformed, expired or unbounded JWT %s',
    (accessToken) => {
      expect(() => parseLoginResponse({ accessToken, user: driver })).toThrow('expirou');
    },
  );
  it('does not trust the expiry cached on disk', () => {
    expect(
      restoreSession(
        JSON.stringify({ accessToken: jwt(1), user: driver, expiresAt: Date.now() + 100000 }),
      ),
    ).toBeNull();
    expect(restoreSession('{corrupt')).toBeNull();
  });
  it('trims email and rejects empty passwords', () => {
    expect(credentialsSchema.parse({ email: ' joao@koda.com ', password: 'secret' }).email).toBe(
      'joao@koda.com',
    );
    expect(credentialsSchema.safeParse({ email: 'joao@koda.com', password: '' }).success).toBe(
      false,
    );
  });
});

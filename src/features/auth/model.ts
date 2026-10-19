import { jwtDecode } from 'jwt-decode';
import { z } from 'zod';

export const credentialsSchema = z.object({
  email: z.string().trim().pipe(z.email('Informe um e-mail válido.')),
  password: z.string().min(1, 'Informe sua senha.'),
});
export type Credentials = z.infer<typeof credentialsSchema>;
export const driverSchema = z.object({
  id: z.union([z.string(), z.number()]),
  name: z.string().default('Motorista'),
  email: z.email(),
  role: z.string(),
  is_active: z.boolean(),
  logistics_center: z.string().optional(),
  central_phone: z.string().optional(),
  phone: z.string().nullable().optional(),
  avatar_url: z.string().nullable().optional(),
});
export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  user: driverSchema,
  expiresAt: z.number().positive(),
});
export type Session = z.infer<typeof sessionSchema>;
export type Driver = Session['user'];

export function requireDriver(user: Driver) {
  if (user.role !== 'driver') throw new Error('Acesso permitido apenas para motoristas.');
  if (!user.is_active) throw new Error('Seu acesso está inativo. Entre em contato com a central.');
}

export function parseLoginResponse(data: unknown): Session {
  const result = z
    .object({
      accessToken: z.string().min(1),
      refreshToken: z.string().min(1).optional(),
      user: driverSchema,
    })
    .safeParse(data);
  if (!result.success)
    throw new Error('Resposta de autenticação inválida. Entre em contato com a central.');
  requireDriver(result.data.user);
  let exp: number | undefined;
  try {
    exp = jwtDecode(result.data.accessToken).exp;
  } catch {
    /* Reject invalid JWT below. */
  }
  if (typeof exp !== 'number' || !Number.isFinite(exp) || exp * 1000 <= Date.now())
    throw new Error('Sua sessão expirou. Entre novamente.');
  return { ...result.data, expiresAt: exp * 1000 };
}

export function restoreSession(raw: string): Session | null {
  try {
    const session = sessionSchema.parse(JSON.parse(raw));
    requireDriver(session.user);
    const exp = jwtDecode(session.accessToken).exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    if (exp * 1000 <= Date.now()) {
      if (!session.refreshToken) return null;
      const refreshExpiry = jwtDecode(session.refreshToken).exp;
      if (typeof refreshExpiry !== 'number' || refreshExpiry * 1000 <= Date.now()) return null;
    }
    return { ...session, expiresAt: exp * 1000 };
  } catch {
    return null;
  }
}

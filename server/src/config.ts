import { z } from 'zod';
export function loadConfig() {
  const config = z
    .object({
      KODA_API_URL: z.url(),
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      PORT: z.coerce.number().int().min(1).max(65535).default(3001),
      CORS_ORIGINS: z
        .string()
        .default(
          'http://localhost:8097,http://localhost:8096,http://localhost:8081,http://localhost:8093',
        ),
      MAPBOX_ACCESS_TOKEN: z.string().default(''),
    })
    .parse(process.env);
  if (!config.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) {
    let role: unknown;
    try {
      role = JSON.parse(
        Buffer.from(config.SUPABASE_SECRET_KEY.split('.')[1], 'base64url').toString(),
      ).role;
    } catch {}
    if (role !== 'service_role')
      throw new Error(
        'Use uma chave secret/service_role apenas em server/.env. Chave anon não é compatível com a autorização Koda.',
      );
  }
  if (
    process.env.NODE_ENV === 'production' &&
    (!config.KODA_API_URL.startsWith('https://') || !config.SUPABASE_URL.startsWith('https://'))
  )
    throw new Error('Produção exige URLs HTTPS.');
  return config;
}

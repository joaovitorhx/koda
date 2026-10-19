import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config';
import { createAuth } from './auth';
import { createRepository } from './repository';
import { createApp } from './app';
const config = loadConfig();
const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
});
const app = createApp(
  createAuth(config.KODA_API_URL.replace(/\/$/, '')),
  createRepository(db, config.MAPBOX_ACCESS_TOKEN),
  config.CORS_ORIGINS.split(',').map((s) => s.trim()),
);
app.listen(config.PORT, '0.0.0.0', () =>
  console.log(`Koda mobile API pronta na porta ${config.PORT}.`),
);

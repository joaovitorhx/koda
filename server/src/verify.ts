import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config';

async function verify() {
  let config: ReturnType<typeof loadConfig>;
  try {
    config = loadConfig();
  } catch {
    throw new Error(
      'Preencha KODA_API_URL, SUPABASE_URL e SUPABASE_SECRET_KEY em server/.env. A chave precisa ser secret/service_role.',
    );
  }
  const db = createClient(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15000) }) },
  });
  const { data, error } = await db.rpc('koda_mobile_schema_version');
  if (error || data !== 5)
    throw new Error(
      'Supabase não confirmou a versão 5. Confira a URL/chave e execute server/supabase-setup.sql no mesmo banco da web.',
    );
  console.log('OK · Supabase acessível e SQL mobile na versão 5.');
  const { error: tripsError } = await db.rpc('koda_mobile_trips', { p_driver: 0, p_trip: null });
  const { error: alertsError } = await db.rpc('koda_mobile_alerts', { p_driver: 0, p_trip: null });
  if (tripsError || alertsError)
    throw new Error(
      'As funções de viagens/alertas não estão disponíveis. Confira as migrações e permissões do banco.',
    );
  console.log('OK · Funções de viagens e alertas disponíveis.');
  let response: Response;
  try {
    response = await fetch(`${config.KODA_API_URL.replace(/\/$/, '')}/users/profile`, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new Error(
      'API original indisponível. Inicie a API usada pela web e confira KODA_API_URL.',
    );
  }
  if (![401, 403].includes(response.status))
    throw new Error(
      `API original respondeu HTTP ${response.status}; confira a base incluindo /api e a rota /users/profile.`,
    );
  console.log('OK · API original alcançável e perfil exige autenticação.');
  console.log(
    'Pronto para iniciar a API mobile. O login e o sensor devem ser homologados com uma conta de motorista e aparelho físico.',
  );
}
verify().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Não foi possível verificar a configuração.',
  );
  process.exitCode = 1;
});

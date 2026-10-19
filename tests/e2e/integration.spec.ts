import { expect, test, type Page } from '@playwright/test';

async function installApi(page: Page) {
  const startedAt = new Date(Date.now() - 60000).toISOString();
  const user = {
    id: 7,
    name: 'Marina Costa',
    email: 'marina@koda.test',
    role: 'driver',
    is_active: true,
    logistics_center: 'CD Integração',
    central_phone: '+5519999999999',
  };
  const jwt = (version: number) =>
    `e30.${btoa(JSON.stringify({ sub: 7, exp: Math.floor(Date.now() / 1000) + 3600, version }))}.test`;
  const trip = {
    id: '1042',
    client: 'Cliente da central',
    address: 'Campinas, SP',
    plate: 'API-1042',
    cargo: 'Vacinas reais da API',
    status: 'pending',
    minTemperature: 2,
    maxTemperature: 8,
    currentTemperature: 4.8,
    latitude: -22.9,
    longitude: -47.1,
    startedAt,
    completedAt: null as string | null,
    vehicleModel: 'Volvo FH',
    vehicleCapacityKg: 12000,
  };
  const reading = {
    id: 'audit-1',
    tripId: '1042',
    temperature: 4.8,
    timestamp: new Date(Date.now() - 8000).toISOString(),
    latitude: -22.9,
    longitude: -47.1,
  };
  const alert = {
    id: '311',
    tripId: '1042',
    openedAt: new Date().toISOString(),
    initialTemperature: 8.4,
    peak: 9.6,
    resolvedAt: null as string | null,
    source: 'server',
    warehouse: null,
    minTemperature: 2,
    maxTemperature: 8,
    status: 'aberto',
  };
  const state = {
    baseUrl: '',
    uploadedTrips: [] as string[],
    alert: false,
    refreshes: 0,
    calls: [] as string[],
    unauthorized: false,
    failTrips: false,
    failFinish: false,
  };
  const report = () => ({
    tripId: '1042',
    startedAt,
    completedAt: trip.completedAt!,
    readingsSent: 1,
    alertCount: state.alert ? 1 : 0,
    timeInRange: 100,
    readings: [reading],
    events: [
      { timestamp: startedAt, title: 'Viagem iniciada · CD Integração', tone: 'info' },
      { timestamp: trip.completedAt!, title: 'Entrega confirmada', tone: 'success' },
    ],
  });
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    state.calls.push(`${method} ${path}`);
    const send = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/api/users/login') {
      state.baseUrl = `${new URL(req.url()).origin}/api`;
      const input = req.postDataJSON();
      if (input.password !== 'correct-password')
        return send({ error: 'Credenciais inválidas' }, 401);
      return send({ accessToken: jwt(1), refreshToken: jwt(0), user });
    }
    if (path === '/api/users/refresh') {
      state.refreshes++;
      expect(req.postDataJSON().refreshToken).toMatch(/^e30\./);
      return send({ accessToken: jwt(2), refreshToken: jwt(0), user });
    }
    if (path === '/api/users/logout') return route.fulfill({ status: 204 });
    expect(req.headers().authorization).toMatch(/^Bearer /);
    if (!state.unauthorized) {
      state.unauthorized = true;
      return send({}, 401);
    }
    if (path === '/api/users/profile') return send({ ...user, name: 'Marina Costa Atualizada' });
    if (path === '/api/telemetria/lote') {
      const packets = req.postDataJSON().readings as {
        id: string;
        driverId: string;
        tripId: string;
      }[];
      expect(packets.every((p) => p.driverId === '7')).toBe(true);
      state.uploadedTrips.push(...packets.map((p) => p.tripId));
      return send({
        acceptedIds: packets.filter((p) => p.tripId === '1042').map((p) => p.id),
        rejected: packets
          .filter((p) => p.tripId !== '1042')
          .map((p) => ({ id: p.id, reason: 'outside_trip' })),
      });
    }
    if (path === '/api/entregas/motorista')
      return send(
        state.failTrips ? { error: 'Central indisponível para teste' } : [trip],
        state.failTrips ? 503 : 200,
      );
    if (path === '/api/entregas/1042/completo') return send(trip);
    if (path === '/api/entregas/1042/iniciar') {
      const input = req.postDataJSON();
      expect(input.latitude).toBeCloseTo(-22.9);
      expect(input.longitude).toBeCloseTo(-47.1);
      trip.status = 'in_transit';
      return send({ id: 1042, status: 'em_transito' });
    }
    if (path === '/api/entregas/1042/telemetria') return send([reading]);
    if (path === '/api/alertas/motorista') return send(state.alert ? [alert] : []);
    if (path === '/api/entregas/1042/contingencia')
      return send({
        name: 'Armazém designado pela central',
        address: 'Valinhos, SP',
        phone: '+5519999999999',
        capacityKg: 15000,
        responsible: null,
        distanceKm: null,
        minutes: null,
        route: [],
        coordinate: { latitude: -22.98, longitude: -47.02 },
      });
    if (path === '/api/entregas/1042/finalizar') {
      if (state.failFinish) return send({ error: 'Entrega não confirmada pela central' }, 409);
      trip.status = 'completed';
      trip.completedAt = new Date().toISOString();
      alert.resolvedAt = trip.completedAt;
      alert.status = 'resolvido';
      return send(report());
    }
    if (path === '/api/entregas/1042/resumo') return send(report());
    throw new Error(`Unexpected API request: ${method} ${path}`);
  });
  return state;
}
async function login(page: Page) {
  await page.goto('/');
  await page
    .getByRole('textbox', { name: 'E-mail Corporativo', exact: true })
    .fill('marina@koda.test');
  await page.getByLabel('Senha', { exact: true }).fill('correct-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar no navegador' }).click();
  await page.getByRole('button', { name: 'Continuar sem sensor' }).click();
  await expect(page.getByText('Cliente da central', { exact: true })).toBeVisible();
}
test('all screens use the authenticated HTTP contracts without demo data', async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -22.9, longitude: -47.1 });
  const api = await installApi(page);
  await login(page);
  expect(api.refreshes).toBe(1);
  await expect(page.getByText('Olá, Marina.')).toBeVisible();
  await expect(page.getByText('Frigorífico Vale Verde')).toHaveCount(0);
  await expect(page.getByText(/Modo demonstração/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhes da viagem 1042' }).click();
  await expect(page.getByText('Vacinas reais da API').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar viagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monitor da carga' })).toBeVisible();
  await expect(page.getByText('4.8°C', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Testar cenários' })).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/screens/integration-monitor.png' });
  api.alert = true;
  await page.getByRole('tab', { name: 'Alertas' }).click();
  await page.getByRole('button', { name: 'Atualizar alertas' }).click();
  await expect(page.getByText('Atenção à temperatura')).toBeVisible();
  await page.getByRole('button', { name: 'Ver rota de contingência' }).click();
  await expect(page.getByText('Armazém designado pela central')).toBeVisible();
  await expect(page.getByText('Não informado')).toBeVisible();
  await page.screenshot({ path: 'artifacts/screens/integration-contingency.png' });
  await page.getByRole('button', { name: 'Manter rota original' }).click();
  api.failFinish = true;
  await page.getByRole('button', { name: 'Finalizar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Entrega não confirmada' })).toBeVisible();
  api.failFinish = false;
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByText('Viagem concluída', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Voltar para minhas viagens' }).click();
  await page.getByRole('button', { name: 'Entregues', exact: true }).click();
  await expect(page.getByText('Cliente da central')).toBeVisible();
  await page.getByRole('button', { name: 'Ver resumo', exact: true }).click();
  await expect(page.getByText('Viagem concluída', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Perfil' }).click();
  await expect(page.getByText('Marina Costa Atualizada')).toBeVisible();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída' }).click();
  await expect(page.getByText('Bem-vindo de volta')).toBeVisible();
  expect(api.calls).toContain('POST /api/users/logout');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /session|token/i.test(key)),
    ),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
test('real API failures stay visible without substituting demo trips', async ({ page }) => {
  const api = await installApi(page);
  await login(page);
  api.failTrips = true;
  await page.getByRole('button', { name: 'Atualizar viagens' }).click();
  await expect(page.getByText('Central indisponível para teste')).toBeVisible();
  await expect(page.getByText('Frigorífico Vale Verde')).toHaveCount(0);
  api.failTrips = false;
  await page.getByRole('button', { name: 'Atualizar viagens' }).click();
  await expect(page.getByText('Central indisponível para teste')).toHaveCount(0);
});

test('reconciles a closed trip, sends other trips and shows the preserved reading in the profile', async ({
  page,
}) => {
  const api = await installApi(page);
  await login(page);
  const key = await page.evaluate((baseUrl) => {
    const scope = btoa(baseUrl).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const key = `koda.${scope}.telemetry`;
    const packet = {
      driverId: '7',
      tripId: '1000',
      temperature: 9.6,
      timestamp: new Date().toISOString(),
      latitude: null,
      longitude: null,
    };
    localStorage.setItem(
      key,
      JSON.stringify([
        { ...packet, id: crypto.randomUUID() },
        { ...packet, id: crypto.randomUUID(), tripId: '1042' },
        { ...packet, id: crypto.randomUUID(), driverId: '8', tripId: '9000' },
      ]),
    );
    return key;
  }, api.baseUrl);
  await page.getByRole('tab', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída' }).click();
  await login(page);
  await page.getByRole('tab', { name: 'Perfil' }).click();
  await page.getByRole('button', { name: 'Ver leituras preservadas' }).click();
  await expect(page.getByText('Viagem #1000', { exact: true })).toBeVisible();
  await expect(page.getByText('9.6 °C', { exact: true })).toBeVisible();
  await expect(page.getByText('Fora do período da viagem', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/screens/integration-archive.png' });
  expect(api.uploadedTrips).toEqual(['1000', '1042']);
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(stored.pending).toHaveLength(1);
  expect(stored.pending[0].driverId).toBe('8');
  expect(stored.archived).toHaveLength(1);
  expect(stored.archived[0].tripId).toBe('1000');
});

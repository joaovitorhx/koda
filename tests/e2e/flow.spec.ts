import { expect, test, type Page } from '@playwright/test';
async function capture(page: Page, name: string) {
  if (name.startsWith('monitor-'))
    await page.getByRole('heading', { name: 'Monitor da carga' }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/screens/${name}.png`,
    animations: 'disabled',
    style: '#error-toast { display: none !important; }',
  });
}
async function credentials(
  page: Page,
  email = 'joao.hanel@kodalogtech.com',
  password = 'Koda@2026',
) {
  await page.getByRole('textbox', { name: 'E-mail Corporativo', exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
}
async function login(page: Page, pair = true) {
  await page.goto('/');
  await credentials(page);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('ACESSOS NECESSÁRIOS')).toBeVisible();
  await capture(page, 'permissions');
  await page.getByRole('button', { name: 'Permitir e continuar' }).click();
  await expect(page.getByRole('button', { name: 'Conectar KODA-IOT-3F2A' })).toBeVisible();
  if (pair) {
    await page.getByRole('button', { name: 'Conectar KODA-IOT-3F2A' }).click();
    await capture(page, 'pairing');
    await page.getByRole('button', { name: 'Continuar com sensor conectado' }).click();
  }
}
async function scenario(page: Page, name: string) {
  await page.getByRole('button', { name: 'Testar cenários' }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
test('complete journey: pairing, detail, monitoring, alert, contingency, offline queue and delivery', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await expect(page.getByText('Frigorífico Vale Verde')).toBeVisible();
  await capture(page, 'trips');
  await page.getByRole('button', { name: 'Em trânsito', exact: true }).click();
  await expect(page.getByText('Frigorífico Vale Verde')).toHaveCount(0);
  await page.getByRole('button', { name: 'Todas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar viagens' }).fill('RTA-2C41');
  await expect(page.getByText('Distribuidora Norte Frios')).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhes da viagem 1042' }).click();
  await expect(page.getByText('Cuidado em cada grau')).toBeVisible();
  await capture(page, 'detail');
  await page.getByRole('button', { name: 'Iniciar viagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monitor da carga' })).toBeVisible();
  await expect(page.getByText('Dentro da faixa', { exact: true })).toBeVisible();
  await capture(page, 'monitor-normal');
  await scenario(page, 'Simular alerta crítico');
  await expect(page.getByText('Atenção à temperatura')).toBeVisible();
  await capture(page, 'critical-alert');
  await page.getByRole('button', { name: 'Ver rota de contingência' }).click();
  await expect(page.getByText('Armazém Frio Sul')).toBeVisible();
  await capture(page, 'contingency');
  await page.getByRole('button', { name: 'Iniciar navegação' }).click();
  await expect(page.getByRole('button', { name: 'Google Maps' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Manter rota original' }).click();
  await expect(
    page.getByText('Acima do máximo', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await capture(page, 'monitor-critical');
  await scenario(page, 'Simular operação offline');
  await expect(page.getByText(/Offline · \d+ na fila/).filter({ visible: true })).toBeVisible();
  await capture(page, 'monitor-offline');
  await page.getByRole('button', { name: 'Finalizar viagem', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Conecte-se à internet' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await scenario(page, 'Temperatura normal · online');
  await expect(page.getByText('Online', { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar viagem', exact: true }).click();
  await expect(page.getByText('Todas as leituras locais estão sincronizadas.')).toBeVisible();
  await capture(page, 'finish');
  await page.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByText('Viagem concluída', { exact: true })).toBeVisible();
  await capture(page, 'summary');
  await page.getByRole('button', { name: 'Voltar para minhas viagens' }).click();
  await page.getByRole('tab', { name: 'Alertas' }).click();
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await expect(page.getByText('Resolvido', { exact: true })).toBeVisible();
  await capture(page, 'alerts');
  await page.getByRole('tab', { name: 'Perfil' }).click();
  await capture(page, 'profile');
  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await capture(page, 'profile-dark');
  await page.getByRole('button', { name: 'Sair da conta', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar saída' }).click();
  await expect(page.getByText('Bem-vindo de volta')).toBeVisible();
  await page.goto('/monitor?id=1042');
  await expect(page.getByText('Bem-vindo de volta')).toBeVisible();
  expect(errors).toEqual([]);
});
test('authentication validation, password visibility and theme', async ({ page }) => {
  await page.goto('/');
  await credentials(page);
  await capture(page, 'login');
  await credentials(page, 'operador@kodalogtech.com');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Acesso permitido apenas para motoristas.')).toBeVisible();
  await capture(page, 'login-error');
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await credentials(page, 'joao.hanel@kodalogtech.com', 'wrong');
  await page.getByRole('button', { name: 'Mostrar senha' }).click();
  await expect(page.getByLabel('Senha', { exact: true })).toHaveJSProperty('type', 'text');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByText('Verifique suas credenciais e tente novamente.').first(),
  ).toBeVisible();
  await credentials(page, 'inativo@kodalogtech.com');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(
    page.getByText('Seu acesso está inativo. Entre em contato com a central.').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await page.getByRole('button', { name: 'Ativar tema escuro' }).click();
  await expect(page.getByRole('button', { name: 'Ativar tema claro' })).toBeVisible();
  await capture(page, 'login-dark');
});
test('empty pairing and offline acceptance keep trip pending', async ({ page, context }) => {
  await login(page, false);
  await page.getByRole('button', { name: 'Simular nenhum sensor' }).click();
  await expect(page.getByText('Nenhum sensor encontrado')).toBeVisible();
  await capture(page, 'pairing-empty');
  await page.getByRole('button', { name: 'Continuar sem sensor' }).click();
  await expect(page.getByText('Frigorífico Vale Verde')).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText('Offline', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar viagem', exact: true }).first().click();
  await expect(page.getByText('Sem conexão com a central', { exact: true })).toBeVisible();
  await capture(page, 'trip-offline');
  await page.getByRole('button', { name: 'Fechar', exact: true }).last().click();
  await expect(
    page.getByRole('button', { name: 'Iniciar viagem', exact: true }).first(),
  ).toBeVisible();
  await context.setOffline(false);
});
test('small phone is usable across preparation and trip screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await login(page);
  await expect(page.getByText('Frigorífico Vale Verde')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await capture(page, 'trips-small');
  await page.getByRole('button', { name: 'Detalhes da viagem 1042' }).click();
  await page.getByRole('button', { name: 'Iniciar viagem', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Monitor da carga' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await capture(page, 'monitor-small');
});

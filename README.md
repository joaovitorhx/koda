# Koda · aplicativo do motorista

Expo SDK 57, React Native 0.86, React 19 e TypeScript. Login, permissões, pareamento BLE, viagens, detalhes, monitor térmico, alertas, contingência, entrega, resumo e perfil usam o mesmo design system e os contratos da central Koda. [Design system](docs/DESIGN_SYSTEM.md).

## Integração com a web

A web existente usa **a API Koda com usuários próprios, senha bcrypt e cookies JWT**, e não Supabase Auth. O mobile usa a mesma conta: o complemento em `server/` autentica na API existente, converte os cookies em uma sessão mobile e acessa o **mesmo banco Supabase** com autorização por motorista. Não é necessário cadastrar usuários novamente.

```text
App Expo → API mobile (server/, porta 3001)
                 ├─ API Koda da web: login, refresh e perfil
                 └─ Mesmo Supabase: viagens, caminhões, cargas, telemetria e alertas
```

O código da web e seu servidor não foram alterados. O complemento adiciona as operações mobile que não existiam neles. **Não basta colocar a chave anon no aplicativo:** é necessário preencher os ambientes, executar o SQL abaixo uma vez e manter a API mobile em execução.

## Configurar e executar

Roteiro atualizado, incluindo atualização de instalações existentes: [EXECUTAR.md](docs/EXECUTAR.md).

Use Node 22.13 ou superior. Há um `.nvmrc` para selecionar a versão instalada nesta máquina.

```sh
nvm use
npm ci
npm run server:install
npm run setup:env
```

`setup:env` cria `.env.local` e `server/.env` sem sobrescrever arquivos existentes. Eles já estão criados nesta entrega com os modelos de configuração.

1. Em **`server/.env`**, preencha:

   | Campo                 | Valor                                                                           |
   | --------------------- | ------------------------------------------------------------------------------- |
   | `KODA_API_URL`        | Mesma base da API usada pela web, incluindo `/api`                              |
   | `SUPABASE_URL`        | URL do mesmo projeto Supabase da central                                        |
   | `SUPABASE_SECRET_KEY` | Chave **secret** (`sb_secret_...`) ou `service_role` legada, apenas no servidor |
   | `CORS_ORIGINS`        | Endereços autorizados para o preview web; os endereços locais já estão listados |

2. No **SQL Editor desse mesmo Supabase**, execute o conteúdo de [`server/supabase-setup.sql`](server/supabase-setup.sql) uma vez. Ele acrescenta vínculos de viagem, IDs para deduplicação e funções de início/sincronização/conclusão. Preserva os cadastros existentes; não contém o schema de referência. O script é transacional e pode ser reaplicado. Foi testado em PostgreSQL local, mas não aplicado a uma base remota nesta entrega.
   Execute a versão atualizada mesmo se já aplicou uma versão anterior. Após preencher os ambientes, `npm run server:verify` confere a versão do SQL, o acesso ao Supabase e a disponibilidade da API original sem modificar dados.
3. Em **`.env.local`**, configure `EXPO_PUBLIC_API_URL` para a API mobile, por exemplo `http://192.168.1.20:3001/api`, e mantenha `EXPO_PUBLIC_DEMO_MODE=false`. No celular, use o IP do computador ou uma URL HTTPS; `localhost` aponta para o próprio aparelho.
4. Execute em dois terminais:

   ```sh
   # Terminal 1 — API mobile; a API original da web também precisa estar acessível
   npm run server:dev

   # Terminal 2 — aplicativo
   npm start
   # Preview web, se preferir:
   npm run web -- --port 8097
   ```

Para instalação nativa com Bluetooth:

```sh
npx expo prebuild --platform android
npm run android -- --device
# Ou, no iPhone:
npx expo prebuild --platform ios
npm run ios -- --device
```

Bluetooth exige development build e aparelho físico; Expo Go/navegador não executam esse adaptador. Expo 57 requer Xcode 26.4 ou superior para compilar iOS. A máquina tinha Xcode 26.0.1 na validação anterior; os bundles JS podem ser exportados independentemente do build do binário. [Documentação Expo 57](https://docs.expo.dev/versions/v57.0.0/).

Nunca coloque a chave Supabase secret/service_role em `EXPO_PUBLIC_*`, no código mobile ou no repositório. O aplicativo recebe somente a URL da API; a chave fica no processo de `server/`. [Chaves Supabase](https://supabase.com/docs/guides/api/api-keys).

## O que cada tela integra

| Tela/fluxo                     | Integração                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| Login e erro                   | Conta da web, validação de motorista ativo, mensagens HTTP, refresh automático e logout            |
| Permissões                     | Localização precisa, Bluetooth e notificações do sistema; navegador informa suas limitações        |
| Pareamento e estado vazio      | Scan/conexão BLE; vínculo do sensor à viagem na API                                                |
| Viagens e detalhe              | Entregas atribuídas ao motorista, carga, cliente, caminhão, limites e centro logístico reais       |
| Iniciar / offline              | GPS inicial, aceite online, verificação de disponibilidade e transição atômica no banco            |
| Monitor normal/crítico/offline | Histórico da auditoria da web, BLE e localização em segundo plano, fila local e reenvio confirmado |
| Alertas e modal crítico        | Eventos de `carga_alertas`, incluindo limites do momento do alerta e histórico                     |
| Contingência                   | Armazém vinculado pela central à entrega, telefone e coordenadas reais; navegação externa          |
| Encerrar e resumo              | Sincronização antes de concluir, liberação do caminhão, resumo calculado dos registros             |
| Perfil                         | Perfil atualizado da mesma API Koda, preferências, permissões, sensor e encerramento da sessão     |

Peso da carga e responsável do armazém não existem no schema atual da web; aparecem como não informados. A contingência só indica o armazém efetivamente designado pela central. O app não escolhe um depósito por distância sem conhecer a capacidade necessária. Distância/ETA ficam indisponíveis quando o serviço de rotas não está configurado.

## Sensor e mapas

O adaptador já usa os dados encontrados no protótipo `app-koda`:

- Nome: `ESP32-DHT11`; também reconhece `KODA-IOT-*`.
- Serviço: `11111111-2222-3333-4444-555555555555`.
- Característica notify: `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`.
- Payload UTF-8/Base64: `T: 4.8 C H: 60 %`. Valores negativos também são aceitos; umidade é validada mas não persistida porque a auditoria existente guarda temperatura.
- O formato JSON `{ "temperature": 4.8, "timestamp": "2026-10-05T12:00:00Z" }` continua suportado. O horário do texto DHT é o de recebimento no aparelho.

Os campos BLE de `.env.local` permitem adaptar outro firmware sem editar código. `EXPO_PUBLIC_BLE_DEVICE_ID`, se preenchido, restringe a descoberta a um dispositivo específico. A compatibilidade física ainda exige homologação com seu sensor.

Mapas iOS usam Apple Maps. Para o mapa nativo Android, preencha `GOOGLE_MAPS_ANDROID_API_KEY` e refaça o build; restrinja a chave ao pacote `com.kodalogtech.driver` e à assinatura do aplicativo. `app.config.ts` injeta a chave no plugin oficial. [Expo Maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/).

`MAPBOX_ACCESS_TOKEN` em `server/.env` é opcional e habilita desenho da rota de contingência, distância e ETA. Google Maps/Waze externos funcionam sem esse token. O telefone da central vem do centro logístico; `EXPO_PUBLIC_CENTRAL_PHONE` é uma substituição opcional.

## Sessão, autorização e dados offline

No Android/iOS, access e refresh tokens ficam no Keychain/Keystore via SecureStore. No navegador ficam em memória; recarregar pede login. A API mobile valida cada requisição na API Koda e deriva o motorista do perfil autenticado. Os RPCs do banco são executáveis apenas pelo papel de servidor; não confiam em um ID de motorista enviado pelo aplicativo.

O access token é renovado antes do vencimento e após um 401, com uma única renovação para requisições concorrentes. Logout limpa sessão e cache locais. O backend web atual apenas apaga cookies no logout, sem revogar JWTs já emitidos; essa limitação continua pertencendo ao contrato original.

A fila usa SQLite no nativo e localStorage no preview, isolada por API/conta/ambiente. Cada leitura tem UUID estável; só confirmações do servidor removem dados locais. O banco deduplica reenvios, rejeita alterações de um UUID já usado, atualiza a mesma carga da web e aciona o trigger de alertas. Pacotes atrasados ficam na auditoria sem retroceder o estado térmico atual. Na conclusão, a fila precisa estar sincronizada; falhas mantêm a viagem aberta. A finalização é idempotente no banco.

## Demonstração

```sh
npm run demo:web -- --port 8096
```

Conta: `joao.hanel@kodalogtech.com` / `Koda@2026`. A demonstração precisa estar explicitamente habilitada e só funciona em desenvolvimento. Não há fallback automático para fixtures quando a API real falha. Os controles de cenários do monitor existem apenas nesse modo.

## Organização e validação

`src/app` contém rotas protegidas; `src/features` separa autenticação, permissões, sensores, viagens, operação, monitor, alertas e perfil; `src/core` concentra HTTP, sessão e fila; `src/shared` reúne componentes e temas. `server/` contém o complemento de integração, mapeadores do schema web, SQL e testes de autorização/transações. Detalhes técnicos em [`server/README.md`](server/README.md).

```sh
npm run check
npm run server:check
# Demonstração iniciada na porta 8096:
E2E_BASE_URL=http://localhost:8096 npm run test:e2e
# Preview real iniciado na porta 8097; testes interceptam HTTP com contratos controlados:
E2E_REAL=true E2E_BASE_URL=http://localhost:8097 npm run test:e2e
npx expo export --platform ios --platform android
```

Os testes de banco executam PostgreSQL via PGlite, incluindo schema, funções e triggers reais. Os testes de navegador verificam todas as telas, renovação de sessão, falhas de rede e entrega com respostas controladas da API. **Nenhum login de produção, Supabase remoto ou sensor físico foi usado nesta validação.**

O coletor nativo em `src/features/tracking` funciona independentemente das telas: persiste viagem/sensor, usa tarefas de localização e serviço em primeiro plano no Android, restauração BLE no iOS, reconexão automática e SQLite. Logout e conclusão interrompem a coleta. Uma viagem encerrada pela central é reconhecida na próxima consulta bem-sucedida. Leituras atrasadas dentro do período entram na auditoria; as demais ficam arquivadas com motivo no aparelho e no servidor, visíveis no perfil, sem travar outras viagens. Alertas que já estavam abertos na saída também aparecem.

A configuração foi validada e o ciclo do coletor/reconexão foi testado com APIs nativas simuladas. A operação com tela apagada precisa ser homologada em aparelho físico. Forçar parada/encerrar manualmente ou restrições de bateria podem interromper o processo; reabra o app para retomar. Não há reconstrução de leituras não capturadas nem push remoto implementado. Ícones do template ainda precisam da identidade final antes da distribuição. [Limites de segundo plano do Expo 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/).

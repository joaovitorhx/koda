# Executar o Koda mobile

O app usa a mesma conta de motorista e o mesmo Supabase da web. A API original da web deve continuar acessível: ela valida login, renovação e perfil. O serviço em `server/` acrescenta as operações mobile.

## 1. Preparar

```sh
cd /Users/joaorockty/koda
nvm use
npm ci
npm run server:install
npm run setup:env
```

Node 22.13+ é obrigatório; `.nvmrc` seleciona 22.23.2. Se essa versão ainda não estiver instalada, execute `nvm install` antes de `nvm use`. `setup:env` preserva os arquivos existentes.

## 2. Preencher os ambientes

Em `server/.env`:

```dotenv
KODA_API_URL=https://SUA-API-KODA/api
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SECRET_KEY=SUA_CHAVE_SECRET_OU_SERVICE_ROLE
PORT=3001
```

Use a URL da API original utilizada pela web, e não a URL da página web. Use o mesmo projeto Supabase do backend. A chave secret/service_role fica **somente em `server/.env`**. Não existe chave Supabase nem chave de assinatura JWT para colocar no aplicativo.

Em `.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://IP-DO-SEU-MAC:3001/api
EXPO_PUBLIC_DEMO_MODE=false
```

Mac e celular precisam estar na mesma rede para esse endereço local. Para consultar o IP Wi-Fi do Mac: `ipconfig getifaddr en0`; se não retornar um IP, consulte Ajustes do Sistema → Rede. `localhost` no celular aponta para o próprio celular. Para servidor publicado, use HTTPS.

Os valores BLE existentes correspondem ao protótipo ESP32-DHT11 do Koda; mantenha-os se esse for o firmware em uso. `GOOGLE_MAPS_ANDROID_API_KEY` é necessária para exibir o mapa nativo Android; iOS usa Apple Maps. `MAPBOX_ACCESS_TOKEN` no servidor é opcional para calcular distância/tempo e desenhar a rota de contingência. Navegação externa funciona sem Mapbox.

## 3. Atualizar o banco da central

Abra o **SQL Editor do mesmo Supabase usado pela web**, copie todo o arquivo `server/supabase-setup.sql` e execute.

**Execute esta versão atualizada mesmo se já executou uma versão anterior.** O script é transacional e pode ser reaplicado. Acrescenta funções, vínculos e deduplicação mobile, preservando cadastros; nesta versão também inclui alertas já abertos e reconciliação de leituras de viagens encerradas. Não execute `000_reference_schema.sql`: ele serve apenas para testes.

Em seguida, no terminal:

```sh
npm run server:verify
```

A verificação lê a versão das funções do Supabase, testa consultas sem motorista e consulta a rota protegida da API original sem credenciais. Não cria viagens nem altera dados. Sucesso confirma configuração e conectividade; o login real ainda precisa ser exercitado no app.

## 4. Iniciar e instalar no aparelho

Terminal 1, na pasta do projeto:

```sh
npm run server:dev
```

Terminal 2, escolha sua plataforma. Como as permissões nativas mudaram, gere o projeto nativo e reinstale o app; apenas recarregar o Metro não aplica essas permissões.

Android, com Android Studio/SDK e aparelho conectado por USB com depuração habilitada:

```sh
npx expo prebuild --platform android
npm run android -- --device
```

iPhone, com Xcode 26.4+ e assinatura Apple configurada:

```sh
npx expo prebuild --platform ios
npm run ios -- --device
```

Expo 57 exige Xcode 26.4+; a instalação local verificada anteriormente era 26.0.1. O development build precisa de aparelho físico para testar BLE. Expo Go e navegador não validam Bluetooth nem a coleta em segundo plano.

Nas próximas execuções, com o build já instalado:

```sh
npm start -- --dev-client
```

Para visualizar as telas no navegador:

```sh
npm run web -- --port 8097
```

Para visualizar sem backend, em demonstração:

```sh
npm run demo:web -- --port 8098
```

Conta de demonstração: `joao.hanel@kodalogtech.com` / `Koda@2026`. O modo real usa o motorista ativo cadastrado na central.

## 5. Conferir no aparelho

1. Entre com o motorista da web e conceda Bluetooth, notificações e localização precisa, inclusive **Sempre/Permitir o tempo todo**.
2. Conecte o sensor, inicie uma entrega atribuída a esse motorista e confira a temperatura na web e no mobile.
3. Apague a tela durante alguns minutos e confira novas leituras ao retornar. No Android, deve aparecer a notificação persistente de monitoramento.
4. Desligue apenas a internet, mantendo Bluetooth ligado. As leituras devem entrar na fila; ao restabelecer a internet, devem sincronizar sem duplicação.
5. Afaste/desligue o sensor e religue-o: o app deve indicar desconexão e retomar as notificações automaticamente.
6. Com leituras pendentes, encerre a viagem pela central e reconecte o app. Leituras do período da viagem entram na auditoria; as posteriores ficam em **Perfil → Leituras do aparelho → Ver leituras preservadas**, com cópia no Supabase em `mobile_telemetry_conflicts`.
7. Confirme outra entrega pelo app e confira resumo/status na web. Ao sair da conta, a coleta deve parar e a fila permanecer vinculada ao motorista original.

A coleta usa tarefas nativas de localização, restauração BLE e SQLite, sem depender da tela Monitor. Não há garantia de execução depois de **Forçar parada**, encerramento manual ou restrições do fabricante: nesse caso reabra o app. Leituras já gravadas permanecem no aparelho; o app não inventa dados do período em que o processo não executou. Veja [Expo Location 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/) e [restauração BLE no iOS](<https://github.com/dotintent/react-native-ble-plx/wiki/Background-mode-(iOS)>).

## Validação do código

```sh
npm run check
npm run server:check
```

Os testes locais cobrem autenticação, fila, reconexão, ciclo do coletor, funções SQL e triggers. Os testes nativos usam APIs do aparelho simuladas. O Supabase remoto, o login de produção e o sensor físico dependem das suas configurações e da conferência acima; não foram homologados nesta entrega.

## Ambiente local preparado em 06/10/2026

A API original foi preparada em `.local/koda-api`, usando o mesmo Supabase configurado no serviço mobile. Essa pasta e seu `.env` ficam fora do Git. A chave JWT de desenvolvimento foi gerada localmente e a criação automática de usuários administradores está desativada. As contas de motorista existentes continuam sendo usadas no login.

Para iniciar novamente nesta máquina, abra três terminais, execute `cd /Users/joaorockty/koda` e `nvm use` em cada um, e rode:

```sh
# Terminal 1: API original, porta 3000
npm run dev --prefix .local/koda-api
```

```sh
# Terminal 2: API mobile, porta 3001
npm run server:dev
```

```sh
# Terminal 3: build nativo no simulador de iPhone
npm run ios -- --device 'iPhone 17 Pro' --port 8099
```

No simulador iOS, `EXPO_PUBLIC_API_URL=http://localhost:3001/api` acessa o servidor do Mac. No aparelho físico, use o IP da rede conforme as instruções acima. A instalação nativa precisa ser feita uma vez; depois, `npm start -- --dev-client --port 8099` inicia o Metro para o app já instalado.

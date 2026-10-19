# API mobile Koda

Complemento executável da API web. Usa os cadastros e a auditoria existentes, sem migrar senhas para Supabase Auth e sem expor uma chave privilegiada no aplicativo.

## Configuração

O roteiro completo está em [EXECUTAR.md](../docs/EXECUTAR.md). Para atualizar uma instalação anterior, reaplique o instalador completo e execute `npm run server:verify`. Preencha `server/.env` a partir de `.env.example`, aplique `supabase-setup.sql` ao banco da central e execute `npm run server:dev` na raiz. Produção: `npm start --prefix server`, com HTTPS na exposição do serviço e nas URLs upstream. `GET /health` verifica que o processo está respondendo; não atesta as credenciais ou disponibilidade dos serviços externos.

- `KODA_API_URL`: base da API original, incluindo `/api`.
- `SUPABASE_URL` e `SUPABASE_SECRET_KEY`: mesmo projeto do backend web. Aceita chave secret nova ou service_role legada. Chaves anon/publishable são rejeitadas.
- `PORT`: padrão 3001.
- `CORS_ORIGINS`: origens do preview web, separadas por vírgula. Aplicativos nativos não precisam enviar Origin.
- `MAPBOX_ACCESS_TOKEN`: opcional, Directions API. Falha ou ausência não bloqueia a indicação do armazém nem a navegação externa.

Autenticação tem limite por IP de 30 tentativas/15 minutos. O deployment deve configurar corretamente o proxy caso precise preservar IPs de origem atrás de um balanceador; o padrão não confia em `X-Forwarded-For` enviado por clientes.

## Origem dos contratos

Implementação confrontada com `/Users/joaorockty/koda-web`, o protótipo `/Users/joaorockty/app-koda` e [koda-server](https://github.com/koda-logtech/koda-server), revisão `a56f36b834e379ad8a2697ff86b1d0f3c1a421ad`.

A web faz `POST /users/login`; o servidor responde com `user` e cookies `access_token`/`refresh_token`. `POST /users/refresh` lê o cookie refresh; `GET /users/profile` aceita Bearer. O complemento usa esses endpoints e verifica o perfil após login/renovação. A chave de assinatura JWT permanece exclusivamente no backend original; não é uma nova variável para este app.

## Rotas relativas a /api

| Método | Rota                         | Resultado                                                       |
| ------ | ---------------------------- | --------------------------------------------------------------- |
| POST   | `/users/login`               | `{ accessToken, refreshToken, user }`                           |
| POST   | `/users/refresh`             | Mesmo formato; body `{ refreshToken }`                          |
| GET    | `/users/profile`             | Perfil ativo da central e centro logístico                      |
| POST   | `/users/logout`              | 204; sem revogação remota no contrato original                  |
| GET    | `/entregas/motorista`        | Viagens do motorista autenticado                                |
| GET    | `/entregas/:id/completo`     | Viagem autorizada                                               |
| PATCH  | `/entregas/:id/iniciar`      | Aceite, snapshot, posição inicial e status do caminhão          |
| PATCH  | `/entregas/:id/sensor`       | Vínculo do sensor da viagem; body `{ sensorId }`                |
| GET    | `/entregas/:id/telemetria`   | Auditoria da viagem, incluindo leituras legadas no período      |
| POST   | `/telemetria/lote`           | Até 100 leituras; `{ acceptedIds, rejected: [{ id, reason }] }` |
| GET    | `/alertas/motorista`         | Eventos térmicos das cargas/intervalos das viagens autorizadas  |
| GET    | `/entregas/:id/contingencia` | Armazém designado ou `null`; rota opcional                      |
| POST   | `/entregas/:id/finalizar`    | Conclusão idempotente e resumo calculado                        |
| GET    | `/entregas/:id/resumo`       | Resumo de viagem entregue                                       |

Todas as rotas de operação exigem Bearer e motorista ativo. O servidor ignora IDs de usuário da query; lotes com `driverId` diferente do perfil são rejeitados. O mesmo escopo é conferido dentro dos RPCs de escrita. Não há `SECURITY DEFINER` nem nova policy pública ampla no Supabase.

Os mapeadores em `src/contracts.ts` convertem o schema português e números DECIMAL. Datas TIMESTAMP sem fuso do schema original são interpretadas como UTC, compatível com o padrão do banco Supabase. O resumo usa o intervalo observado pelas leituras, ponderado por duração; ausência de leituras ou de limites produz `timeInRange: null`, nunca um percentual inventado.

## SQL

`supabase-setup.sql` é o arquivo único para instalação, gerado por `npm run server:sql`. Ele combina:

1. `001_existing_thermal_alerts.sql`: trigger/tabela de alertas do servidor web, idempotente.
2. `002_mobile_operations.sql`: vínculos, snapshots, UUIDs de leituras e RPCs de autorização/transição.
3. `003_offline_alert_order.sql`: preserva o estado atual de alertas quando chegam leituras mais antigas.
4. `004_operational_reliability.sql`: consulta alertas que se sobrepõem ao período da viagem, recebe leituras atrasadas de viagens encerradas e preserva conflitos com recibos idempotentes.
5. `005_closed_trip_alerts.sql`: impede que telemetria de viagem encerrada altere o alerta atual da carga e disponibiliza a versão do schema para `npm run server:verify`.

A instalação inteira roda em uma transação e notifica o PostgREST para recarregar o schema. Não recria tabelas operacionais. `000_reference_schema.sql` é uma cópia do schema original **exclusivamente para os testes em banco vazio**; não está no instalador.

Novas colunas preservam o motorista/carga/destinatário da viagem iniciada, mesmo depois de trocar o caminhão de motorista ou carga. Viagens legadas sem snapshot usam os vínculos atuais até serem concluídas pelo mobile. Operações de início e fim travam o motorista, caminhão e entrega na mesma ordem. Tentativas repetidas não alteram o horário de conclusão. A leitura só é confirmada depois de persistida; reusar UUID com conteúdo diferente falha e um lote inválido sofre rollback inteiro.

O trigger continua trabalhando com eventos da central por carga. Leituras antigas recebidas após uma mais recente continuam disponíveis na auditoria, mas não reabrem/resolvem retroativamente o alerta atual. Não há reconstrução histórica de eventos atrasados. Leituras capturadas durante uma viagem encerrada continuam sendo aceitas na auditoria. Leituras fora do período são persistidas em `mobile_telemetry_conflicts` e retornam em `rejected`; o app as move para um arquivo local e segue com as outras viagens. Não há descarte silencioso. O arquivo de conflitos tem RLS e acesso apenas pelo servidor. O recibo não autoriza reusar UUID com conteúdo diferente.

## Testes

`npm run server:check` executa TypeScript, contratos HTTP, cookies/renovação e PostgreSQL/PGlite. Não utiliza chaves reais nem acessa uma base remota. As migrações são verificadas em banco vazio com o schema original; diferenças no schema de uma instalação existente precisam ser conciliadas antes da aplicação.

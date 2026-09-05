# EV Charge Platform

Plataforma de recarga de veículos elétricos: motorista, operação, billing e **OCPP 1.6J** para carregadores físicos.

## Estado atual do projeto

**BETA FUNCIONAL**

- Autenticação JWT + refresh, RBAC, multi-tenant
- Driver (Expo) e Admin (Next.js)
- Estações, carregadores, conectores, tarifas, sessões
- `MockChargerProvider` (padrão) e `OcppChargerProvider` (OCPP 1.6J)
- Simulador OCPP, telemetria, health, incidentes, manutenção
- Reservas, waitlist, favoritos
- Carteira, PIX, cartão tokenizado, hold, capture, refund, webhooks
- Asaas em **SANDBOX** (não use produção até fornecer chave real)
- Reconciliação financeira e recibos
- Pronto para publicar o beta na internet (VPS + WSS). **Não há deploy automático**

OCPP implementado: **1.6J**. OCPP 2.0.1 não faz parte deste beta.

## Funcionalidades

Mapa e lista de estações, início/parada de recarga com evidência do carregador, carteira, pagamentos sandbox, operação OCPP (RemoteStart/Stop, Reset, ChangeAvailability), dashboard administrativo.

## Arquitetura

```
Driver ──HTTPS/JWT──► API NestJS ──► PostgreSQL
Admin ──HTTPS/cookie BFF──► API
Charge Point ──WSS OCPP 1.6J──► mesmo processo da API (/ocpp/{identity})
```

A API **não** pode ser serverless: o gateway OCPP precisa de WebSocket longo. Detalhes: [docs/deploy.md](docs/deploy.md) · [docs/architecture/overview.md](docs/architecture/overview.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | Turborepo + pnpm |
| API | NestJS + TypeScript |
| Admin | Next.js |
| Driver | React Native + Expo |
| Banco | PostgreSQL + Prisma **6** (não atualize para 7 / Prisma Cloud) |
| Protocolo | OCPP 1.6J (`@evcharge/ocpp`) |
| Pagamento | Mock (padrão) + Asaas sandbox |

## Instalação local

```bash
pnpm install
cp .env.example .env
cp packages/database/.env.example packages/database/.env
# Preencha DATABASE_URL, DIRECT_URL, JWT_* (≥32 chars)
pnpm db:generate
pnpm db:push
pnpm db:seed   # opcional — dados demo
pnpm dev
```

JWT secrets de exemplo no `.env.example` são **recusados** no boot. Gere valores reais (`openssl rand -hex 32`).

## Configurar

Todas as variáveis estão comentadas em [`.env.example`](.env.example). Nunca commite `.env`, chaves Asaas, JWT ou secrets OCPP.

| Variável | Função |
|---|---|
| `CHARGER_PROVIDER_TYPE=mock` | Padrão local/testes |
| `PAYMENT_PROVIDER=mock` | Padrão; Asaas só com `PAYMENT_API_KEY` |
| `CORS_ORIGINS` | Origens HTTPS extras (localhost já entra) |
| `OCPP_PUBLIC_URL` | Base `ws://` local ou `wss://` na internet |

## Rodar testes

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## Acessos locais

| App | URL |
|---|---|
| API | http://localhost:3001/api |
| Swagger | http://localhost:3001/api/docs |
| Health | http://localhost:3001/api/health |
| Admin | http://localhost:3000 |
| Driver | http://localhost:8081 |
| OCPP | `ws://localhost:3001/ocpp/EVSE-CUIABA-001` |

Demo: senha `Demo@12345` · `superadmin@evcharge.demo` · `driver1@evcharge.demo` · charger `EVSE-CUIABA-001` (secret de seed `DemoCharger@12345`).

## Simulador OCPP

```bash
pnpm --filter @evcharge/api dev
CHARGER_ID=EVSE-CUIABA-001 \
OCPP_URL=ws://localhost:3001/ocpp \
CHARGER_SECRET=DemoCharger@12345 \
pnpm charger:simulator
```

Admin → Carregadores deve mostrar ONLINE após BootNotification.

## Cadastrar carregador

Admin → Estações → criar charger com `identity` única e `providerId=ocpp16` → abrir o charger → **Gerar credencial OCPP**.

## Carregador físico

1. Publicar a API com **WSS** ([docs/deploy.md](docs/deploy.md)).
2. No painel do equipamento: URL `wss://ocpp.seudominio.com/ocpp/{identity}`, protocolo 1.6J, Basic auth.
3. Guia do técnico: [docs/manual/charger-installation.md](docs/manual/charger-installation.md).

## Deploy

Não publicamos em nenhuma conta por você.

1. VPS + Caddy (`docker-compose.production.yml`)
2. Postgres que você já usa
3. Quatro DNS: `api`, `ocpp`, `admin`, `app`
4. `.env.production` a partir de `.env.production.example`

Passo a passo: [docs/deploy.md](docs/deploy.md) · checklist: [docs/production-checklist.md](docs/production-checklist.md).

## Manuais e fluxos

- [Manual do sistema](docs/manual/system-manual.md)
- [Manual do motorista](docs/manual/driver-manual.md)
- [Manual do admin](docs/manual/admin-manual.md)
- [OCPP](docs/ocpp.md)
- [Ciclo da sessão](docs/architecture/session-lifecycle.md)
- [Billing](docs/architecture/billing-flow.md)
- [Fluxo de recarga](docs/architecture/charging-flow.md)
- [API](docs/api.md)
- [Troubleshooting](docs/manual/troubleshooting.md)

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm dev` | API, Admin, Driver e simulador (turbo) |
| `pnpm build` / `lint` / `typecheck` / `test` | Qualidade |
| `pnpm db:generate` / `db:push` / `db:seed` / `db:studio` | Prisma |
| `pnpm charger:simulator` | OCPP 1.6J local |

Produção: `pnpm --filter @evcharge/database exec prisma migrate deploy` (use `DIRECT_URL`). Nunca `migrate reset` no banco real.

## Estrutura

```
apps/api                 REST + OCPP + realtime
apps/admin               Painel
apps/driver              App motorista
apps/charger-simulator   Charge Point de laboratório
packages/database        Prisma 6 / PostgreSQL
packages/ocpp            1.6J
docs/                    Manuais e arquitetura
deploy/                  Caddy + Dockerfiles
```

Docker Compose **local** (`docker-compose.yml`) sobe só Postgres opcional. Compose **produção** (`docker-compose.production.yml`) sobe API+Admin+Driver+Caddy e **não** substitui o banco.

## Roles

| Role | Escopo |
|---|---|
| DRIVER | App motorista |
| OPERATOR | Operação da empresa |
| ADMIN | Administração da empresa |
| SUPER_ADMIN | Rede inteira |

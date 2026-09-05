# EV Charge Platform

Plataforma de gerenciamento e recarga de veículos elétricos.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | Turborepo + pnpm |
| API | NestJS + TypeScript |
| Admin | Next.js + shadcn/ui |
| Driver | React Native + Expo + Expo Router |
| Banco | PostgreSQL (Supabase) + Prisma |
| Shared | TypeScript + Zod |
| Infra local opcional | Docker Compose |

## Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- Projeto Supabase com PostgreSQL habilitado

> Docker é **opcional** — serve apenas para rodar PostgreSQL localmente. O fluxo padrão usa Supabase.

## Instalação

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
cp packages/database/.env.example packages/database/.env

# 3. Preencher DATABASE_URL e DIRECT_URL com as credenciais do Supabase
#    Dashboard → Project Settings → Database → Connection string

# 4. Gerar Prisma Client e aplicar schema
pnpm db:generate
pnpm db:push

# 5. Iniciar todos os apps em modo desenvolvimento
pnpm dev
```

## Configuração Supabase

No [Supabase Dashboard](https://supabase.com/dashboard), acesse **Project Settings → Database** e copie:

| Variável | Uso | Porta |
|---|---|---|
| `DATABASE_URL` | Prisma Client / API (Transaction Pooler) | 6543 |
| `DIRECT_URL` | Prisma CLI (`db push`, `migrate`, `studio`) | 5432 |

**Importante:**
- `DATABASE_URL` deve incluir `?pgbouncer=true` quando usar o pooler
- `DIRECT_URL` usa conexão direta — necessária para migrations
- Nunca commite URLs ou senhas reais no repositório

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia API, Admin, Driver e Simulador |
| `pnpm build` | Build de todos os pacotes e apps |
| `pnpm lint` | ESLint em todo o monorepo |
| `pnpm typecheck` | Verificação de tipos TypeScript |
| `pnpm test` | Testes unitários e E2E (API) |
| `pnpm db:generate` | Gera Prisma Client |
| `pnpm db:push` | Aplica schema ao banco Supabase |
| `pnpm db:migrate` | Cria/aplica migrations |
| `pnpm db:seed` | Popula dados demo (idempotente) |
| `pnpm db:studio` | Abre Prisma Studio |
| `pnpm simulator` | Simulador mock legado |
| `pnpm charger:simulator` | Simulador OCPP 1.6J (`EVSE-CUIABA-001`) |

## Apps

| App | Porta | URL |
|---|---|---|
| API (NestJS) | 3001 | http://localhost:3001/api |
| Admin (Next.js) | 3000 | http://localhost:3000 |
| Driver (Expo) | 8081 | http://localhost:8081 (web) |
| Charger Simulator | — | Processo standalone |

### Driver (Expo)

```bash
pnpm --filter @evcharge/driver dev
```

Pressione `w` no terminal do Expo para abrir a versão web em http://localhost:8081.

## Estrutura

```
apps/
  api/                  # NestJS REST API + gateway OCPP 1.6J
  admin/                # Next.js painel administrativo
  driver/               # Expo app motorista
  charger-simulator/    # Simulador OCPP 1.6J (e modo mock)

packages/
  domain/               # Regras de negócio e erros de domínio
  database/             # Prisma schema e client
  charger-provider/     # Abstração ChargerProvider (Mock + OCPP)
  payment-provider/     # Abstração PaymentProvider (mock DEMO)
  ocpp/                 # Framing, schemas e mappers OCPP 1.6J
  shared/               # Schemas Zod, tipos e constantes
  ui/                   # Componentes UI compartilhados
```

## Docker (opcional)

Para desenvolvimento offline com PostgreSQL local:

```bash
docker compose up -d
```

Configure `.env` com URLs locais:

```
DATABASE_URL="postgresql://evcharge:evcharge@localhost:5432/evcharge?schema=public"
DIRECT_URL="postgresql://evcharge:evcharge@localhost:5432/evcharge?schema=public"
```

## Endpoints (Fase 2)

Documentação interativa: **http://localhost:3001/api/docs**

Documentação interativa: **http://localhost:3001/api/docs**

### Auth
- `POST /api/auth/register` — Registro (driver ou operator/admin com empresa)
- `POST /api/auth/login` — Login
- `POST /api/auth/refresh` — Renovar access token (rotação de refresh token)
- `POST /api/auth/logout` — Revogar refresh token
- `GET /api/auth/me` — Usuário autenticado

### Users
- `GET /api/users/me` — Perfil do usuário
- `PATCH /api/users/me` — Atualizar perfil

### Companies
- `GET /api/companies/:id` — Detalhe da empresa (isolamento multi-tenant)
- `POST /api/companies` — Criar empresa (super_admin)
- `PATCH /api/companies/:id` — Atualizar empresa (admin+)

### Vehicles
- `GET/POST /api/vehicles` — CRUD de veículos (driver: apenas próprios)

### Stations / Chargers / Connectors
- CRUD completo com filtros geo/status em stations
- Operadores restritos à própria empresa

### Health
- `GET /api/health` — Health check (inclui status do banco)

### Sessions (Fase 2)
- `POST /api/sessions/start` — Iniciar recarga (`connectorId`, `vehicleId`)
- `POST /api/sessions/:id/stop` — Encerrar recarga
- `POST /api/sessions/:id/pause` — Pausar
- `POST /api/sessions/:id/resume` — Retomar
- `GET /api/sessions` — Histórico (filtros por status/estação/período)
- `GET /api/sessions/:id` — Detalhe da sessão
- `GET /api/sessions/active/live` — Sessões ativas (operador)

WebSocket frontend: `ws://localhost:3001/realtime` (JWT no `auth.token`)  
WebSocket OCPP: `ws://localhost:3001/ocpp/{identity}` (subprotocolo `ocpp1.6`, Basic auth de equipamento)

### Pagamentos / reservas (Fase 5)
- `POST /api/payments` — PIX/cartão/wallet via `PaymentProvider` (mock por padrão)
- `POST /api/payments/:id/simulate` — confirmar/recusar no ambiente DEMO
- `POST /api/payments/webhooks/:provider` — webhook idempotente
- `GET /api/finance/summary` — KPIs operacionais
- `POST /api/reservations` / `GET /api/reservations/me`
- `POST /api/waitlist` / `POST /api/waitlist/:id/claim`
- `GET/POST /api/favorites`
- `GET /api/tariffs/quote` — estimativa calculada no backend

Documentação: [docs/payments.md](docs/payments.md) · [docs/reservations.md](docs/reservations.md)

## Roles

| Role | Escopo |
|---|---|
| `driver` | Próprios dados e veículos; leitura de infraestrutura |
| `operator` | Dados da empresa |
| `admin` | Administração da empresa |
| `super_admin` | Acesso global |

## Dados demo (`pnpm db:seed`)

Senha de todos os usuários demo: `Demo@12345`

| Usuário | Email |
|---|---|
| Super admin | `superadmin@evcharge.demo` |
| Operador SP | `operator.sp@evcharge.demo` |
| Operador RJ | `operator.rj@evcharge.demo` |
| Operador MT | `operator.mt@evcharge.demo` |
| Admin SP | `admin.sp@evcharge.demo` |
| Motoristas | `driver1@evcharge.demo` … `driver5@evcharge.demo` |

Empresas: `evcharge-sp`, `evcharge-rj`, `evcharge-mt` — estações, carregadores mock e um charger OCPP `EVSE-CUIABA-001` (OFFLINE até o simulador conectar).
Wallets demo: R$ 100,00 por motorista. Tarifas: R$ 1,89/kWh (SP/MT), R$ 1,75/kWh (RJ).

## OCPP 1.6J

A recarga mock continua no `MockChargerProvider` **dentro da API** (`CHARGER_PROVIDER_TYPE=mock`).

Carregadores com `providerId=ocpp16` falam OCPP 1.6J:

```bash
pnpm --filter @evcharge/api dev

CHARGER_ID=EVSE-CUIABA-001 \
OCPP_URL=ws://localhost:3001/ocpp \
CHARGER_SECRET=DemoCharger@12345 \
pnpm charger:simulator
```

Fluxo: Driver start → RemoteStartTransaction → StartTransaction → MeterValues → Driver stop → RemoteStopTransaction → StopTransaction → recibo.

Documentação completa: [docs/ocpp.md](docs/ocpp.md)

O simulador mock legado permanece:

```bash
pnpm simulator
pnpm --filter @evcharge/charger-simulator dev -- --mode mock --scenario FAST --meter-interval 2000
```

## Fase atual

**Fase 5 — Pagamento, reservas e experiência do motorista**: `PaymentProvider` mock (PIX/cartão DEMO), snapshot de tarifa, reservas, fila, favoritos e telas Admin/Driver. OCPP 1.6J da Fase 4 permanece.

Não iniciar Fase 6 automaticamente.

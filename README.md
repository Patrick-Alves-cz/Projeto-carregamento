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
| `pnpm test` | Testes unitários |
| `pnpm db:generate` | Gera Prisma Client |
| `pnpm db:push` | Aplica schema ao banco Supabase |
| `pnpm db:migrate` | Cria/aplica migrations |
| `pnpm db:studio` | Abre Prisma Studio |

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
  api/                  # NestJS REST API
  admin/                # Next.js painel administrativo
  driver/               # Expo app motorista
  charger-simulator/    # Simulador de carregador (dev/demo)

packages/
  domain/               # Regras de negócio e erros de domínio
  database/             # Prisma schema e client
  charger-provider/     # Abstração ChargerProvider
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

## Endpoints (Fase 0)

- `GET /api` — Informações da API
- `GET /api/health` — Health check (inclui status do banco)

## Fase atual

**Fase 0 — Fundação**: monorepo, banco Supabase, apps mínimos funcionais.

Próxima fase: autenticação, CRUD de entidades, seed de dados demo.

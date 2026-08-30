# EV Charge Platform

Plataforma de gerenciamento e recarga de veículos elétricos.

## Stack

| Camada | Tecnologia |
|---|---|
| Monorepo | Turborepo + pnpm |
| API | NestJS + TypeScript |
| Admin | Next.js + shadcn/ui |
| Driver | React Native + Expo + Expo Router |
| Banco | PostgreSQL + Prisma |
| Shared | TypeScript + Zod |
| Infra | Docker Compose |

## Pré-requisitos

- Node.js >= 20
- pnpm >= 9
- Docker e Docker Compose

## Instalação

```bash
# 1. Instalar dependências
pnpm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
cp packages/database/.env.example packages/database/.env

# 3. Subir PostgreSQL
docker compose up -d

# 4. Gerar client Prisma e aplicar schema
pnpm db:generate
pnpm db:push

# 5. Iniciar todos os apps em modo desenvolvimento
pnpm dev
```

## Scripts

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia API, Admin, Driver e Simulador |
| `pnpm build` | Build de todos os pacotes e apps |
| `pnpm lint` | ESLint em todo o monorepo |
| `pnpm typecheck` | Verificação de tipos TypeScript |
| `pnpm test` | Testes unitários |
| `pnpm db:generate` | Gera Prisma Client |
| `pnpm db:push` | Aplica schema ao banco |
| `pnpm db:migrate` | Cria/aplica migrations |
| `pnpm db:studio` | Abre Prisma Studio |

## Apps

| App | Porta | URL |
|---|---|---|
| API (NestJS) | 3001 | http://localhost:3001/api |
| Admin (Next.js) | 3000 | http://localhost:3000 |
| Driver (Expo) | 8081 | Expo DevTools |
| Charger Simulator | — | Processo standalone |

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

## Endpoints (Fase 0)

- `GET /api` — Informações da API
- `GET /api/health` — Health check (inclui status do banco)

## Fase atual

**Fase 0 — Fundação**: monorepo, banco, apps mínimos funcionais.

Próxima fase: autenticação, CRUD de entidades, seed de dados demo.

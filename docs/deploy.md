# Deploy do EV Charge (beta na internet)

Este guia descreve como publicar o **beta funcional** sem reescrever a stack.
A experiência pública é um SaaS de **endereço único**. OCPP continua em processo Node longo.

## Decisão Vercel vs servidor longo

| Parte | Vercel nesta versão? | Motivo |
|---|---|---|
| Admin Next (`/login`, `/admin`, BFF cookies) | Sim | HTTP request/response, cookies host-only |
| Driver web (`/app`) | Sim, atrás do mesmo host (rewrite/proxy) | Não precisa de processo próprio na rua |
| API NestJS (REST) | **Não** | `setInterval` (sessão mock, reservas, pagamentos, watchdog OCPP) |
| Socket.IO `/realtime` | **Não** | Precisa de processo estável e sticky session |
| OCPP 1.6J `wss://…/ocpp/{identity}` | **Não** | `OcppConnectionManager` é `Map` **em memória**; Heartbeat 60s; Fluid Compute / Functions não substituem um Node longo |

WebSockets em Fluid Compute existem em beta na Vercel. **Não servem** para o OCPP atual: o socket do carregador tem que cair sempre no mesmo processo que guarda a conexão, dispara RemoteStart e recebe MeterValues. Várias instâncias ou freeze da function = charger “some”, sessão órfã, isolamento quebrado na prática.

Arquitetura pública desta versão:

```
https://evcharge.com.br          → Vercel (Next) OU Caddy no VPS
https://api.evcharge.com.br      → VPS / Node longo (Nest)
wss://ocpp.evcharge.com.br/ocpp/{identity} → o mesmo processo da API
```

Simplificar para um único hostname na web (`/login`, `/app`, `/admin`) é o desejado. **Não** coloque OCPP no mesmo host serverless. OCPP pode ficar em subdomínio no **mesmo VPS** da API.

## Por que a API não vai para a Vercel

O gateway OCPP usa **WebSocket persistente** no mesmo processo HTTP da API:

- Web: `https://evcharge.com.br` (login) → `/app` ou `/admin`
- REST: `https://api.evcharge.com.br/api`
- Socket.IO: `https://api.evcharge.com.br/realtime`
- OCPP 1.6J: `wss://ocpp.evcharge.com.br/ocpp/{identity}`

Funções serverless fecham conexões ociosas. Carregadores físicos mantêm a sessão com Heartbeat. Por isso **API + OCPP ficam juntos em um processo Node longo**.

O PostgreSQL atual **não muda**. Prisma permanece na versão do repositório. Mock continua o provider padrão. Asaas permanece em sandbox.

## Ambientes


| Ambiente | Como roda | Banco | Pagamento | OCPP |
|---|---|---|---|---|
| **Development** | `pnpm dev` — porta web única `localhost:3000` | `.env` local (Supabase ou Docker Postgres) | `PAYMENT_PROVIDER=mock` | `ws://localhost:3001/ocpp/{identity}` |
| **Staging** | Mesmo compose de produção, outros DNS | Cópia ou projeto separado | mock ou Asaas sandbox | `wss://ocpp-staging...` |
| **Production** | `docker-compose.production.yml` no VPS | Postgres gerenciado existente | mock até credenciais reais; depois Asaas produção | `wss://ocpp.evcharge.com.br/ocpp/{identity}` |

O padrão local **não depende** do compose de produção. `localhost:8081` continua só para o cliente nativo Expo.

## Arquitetura recomendada (barata, adequada ao beta)

```
Navegador ──HTTPS──► evcharge.com.br
                      │
                      ├── /login  → Admin (Next, BFF cookies)
                      ├── /admin  → Admin (Next)
                      └── /app    → Driver (Expo web, mesmos cookies)
                            │
                            └── BFF /api/proxy ──► API interna
Carregador físico ──WSS───► ocpp.evcharge.com.br ──► mesmo processo da API
Clientes HTTP     ──HTTPS─► api.evcharge.com.br  ──► NestJS :3001
                                          │
                                          ▼
                                   PostgreSQL (já existente)
```

Um VPS pequeno (2 vCPU / 4 GB, exemplo Hetzner CX22 ou equivalente) + Caddy (HTTPS/WSS automático) + o banco que você já usa.

A API/OCPP **não** pode ir para a Vercel.

## Domínios e DNS

Crie 3 registros A (ou CNAME) apontando para o IP do VPS:

| Host | Aponta para | Protocolo |
|---|---|---|
| `evcharge.com.br` | VPS | HTTPS — login, `/app`, `/admin` |
| `api.evcharge.com.br` | VPS | HTTPS + WSS (`/realtime`) |
| `ocpp.evcharge.com.br` | VPS (mesmo IP) | **WSS obrigatório** `/ocpp/{identity}` |

Portas públicas: **80** e **443**. Internamente: API 3001, Admin 3000, Driver 8081.

O Caddy faz upgrade WebSocket automaticamente. Timeouts longos estão no `deploy/Caddyfile` para Heartbeat OCPP.

URL no painel do carregador:

```
wss://ocpp.evcharge.com.br/ocpp/EVSE-CUIABA-001
```

Subprotocolo: `ocpp1.6`. Auth: HTTP Basic `identity:secret`.

## Variáveis no servidor

Copie `.env.production.example` → `.env.production` **só no VPS** (gitignored).

Obrigatórias:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars, não use o exemplo)
- `DATABASE_URL` (pooler) e `DIRECT_URL` (direto)
- `CORS_ORIGINS=https://evcharge.com.br`
- `NEXT_PUBLIC_API_URL=https://api.evcharge.com.br/api`
- `API_INTERNAL_URL=http://api:3001/api`
- `EXPO_PUBLIC_API_URL=https://api.evcharge.com.br/api`
- `DRIVER_ORIGIN=http://driver:8081`
- `OCPP_PUBLIC_URL=wss://ocpp.evcharge.com.br/ocpp`
- `COOKIE_SECURE=true`
- `PAYMENT_PROVIDER=mock` até você decidir
- `ACME_EMAIL`, `WEB_HOST`, `API_HOST`, `OCPP_HOST`

Nunca coloque secrets no Git. Cookie host-only (sem `COOKIE_DOMAIN`) cobre `/login`, `/app` e `/admin`.

## Migrations em produção

Prisma **6.x** do repo. Comando seguro:

```bash
pnpm --filter @evcharge/database exec prisma migrate deploy
```

Use `DIRECT_URL` (sem PgBouncer) para o CLI. A API continua em `DATABASE_URL`.

Não use `migrate reset`, `migrate dev` nem `db push --accept-data-loss` em produção.

Se o banco já foi atualizado no passado com `db push` e a tabela `_prisma_migrations` estiver atrasada, **não** rode `migrate deploy` no escuro (as SQL podem tentar criar o que já existe). Nesse caso, faça baseline (`prisma migrate resolve --applied <nome>`) só depois de conferir que o schema já está igual. Banco novo: `migrate deploy` do zero.

## Passos para ficar online

1. Comprar/apontar o domínio e os 3 hosts acima.
2. Provisionar o VPS, abrir 80/443, clonar o repositório, copiar `.env.production`.
3. Rodar `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build`.
4. Aplicar `prisma migrate deploy` contra `DIRECT_URL`.
5. Conferir `https://api.evcharge.com.br/api/health` e `https://evcharge.com.br/login`.
6. Login único, gerar credencial OCPP, configurar o carregador físico com WSS.

Detalhe operacional: [docs/production-checklist.md](production-checklist.md) e [docs/manual/charger-installation.md](manual/charger-installation.md).

## Beta temporário neste Mac (sem VPS)

Enquanto o VPS/DNS de `evcharge.com.br` não existir, o caminho que funciona é:

1. `docker compose up -d` (Postgres local)
2. `pnpm --filter @evcharge/database exec prisma migrate deploy`
3. `pnpm dev --concurrency=20`
4. `pnpm charger:simulator`
5. Túnel público (Cloudflare quick tunnel) para `:3000` (web) e `:3001` (API/OCPP)

A URL `*.trycloudflare.com` **muda** a cada restart e **cai** se o Mac dormir. Não use isso como produção.

A Vercel (`https://evcharge-gamma.vercel.app`) já publica o Admin. Login lá só funciona depois que `API_INTERNAL_URL` apontar para uma API pública estável (VPS), com o mesmo `JWT_ACCESS_SECRET` da API.

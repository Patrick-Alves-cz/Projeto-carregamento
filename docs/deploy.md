# Deploy do EV Charge (beta na internet)

Este guia descreve como publicar o **beta funcional** sem reescrever a stack.
Não há deploy automático: você cria DNS, preenche secrets e sobe o VPS.

## Por que um VPS (e não serverless)

O gateway OCPP usa **WebSocket persistente** no mesmo processo HTTP da API:

- REST: `https://api.seudominio.com/api`
- Socket.IO (Admin/Driver): `https://api.seudominio.com/realtime`
- OCPP 1.6J: `wss://ocpp.seudominio.com/ocpp/{identity}`

Funções serverless (Vercel/Lambda) fecham conexões ociosas. Carregadores físicos mantêm a sessão aberta com Heartbeat. Por isso a **API + OCPP ficam juntos em um processo Node longo**.

O PostgreSQL atual (Supabase ou outro Postgres) **não muda**. Prisma permanece na versão do repositório. Mock continua o provider padrão. Asaas permanece em sandbox até você fornecer chave de produção.

## Ambientes

| Ambiente | Como roda | Banco | Pagamento | OCPP |
|---|---|---|---|---|
| **Development** | `pnpm dev` nas portas 3000 / 3001 / 8081 | `.env` local (Supabase ou Docker Postgres) | `PAYMENT_PROVIDER=mock` | `ws://localhost:3001/ocpp/{identity}` |
| **Staging** | Mesmo compose de produção, outros DNS | Cópia ou projeto separado | mock ou Asaas sandbox | `wss://ocpp-staging...` |
| **Production** | `docker-compose.production.yml` no VPS | Postgres gerenciado existente | mock até credenciais reais; depois Asaas produção | `wss://ocpp.seudominio.com/ocpp/{identity}` |

O padrão local **não depende** do compose de produção.

## Arquitetura recomendada (barata, adequada ao beta)

```
Motorista (app/web) ──HTTPS──► app.seudominio.com  ──► Driver (Expo web)
Operador (Admin)    ──HTTPS──► admin.seudominio.com ──► Next.js
                            │
                            └── BFF /api/proxy ──► API interna
Carregador físico   ──WSS───► ocpp.seudominio.com ──► mesmo processo da API
Clientes HTTP       ──HTTPS─► api.seudominio.com  ──► NestJS :3001
                                          │
                                          ▼
                                   PostgreSQL (já existente)
```

Um VPS pequeno (2 vCPU / 4 GB, exemplo Hetzner CX22 ou equivalente) + Caddy (HTTPS/WSS automático) + o banco que você já usa.

Admin e Driver **podem** ir para a Vercel depois; a API/OCPP **não**.

## Domínios e DNS

Crie 4 registros A (ou CNAME) apontando para o IP do VPS:

| Host | Aponta para | Protocolo |
|---|---|---|
| `api.seudominio.com` | VPS | HTTPS + WSS (`/realtime`, `/ocpp`) |
| `ocpp.seudominio.com` | VPS (mesmo IP) | **WSS obrigatório** `/ocpp/{identity}` |
| `admin.seudominio.com` | VPS | HTTPS |
| `app.seudominio.com` | VPS | HTTPS (Driver web) |

Portas públicas: **80** e **443**. Internamente: API 3001, Admin 3000, Driver 8081.

O Caddy faz upgrade WebSocket automaticamente. Timeouts longos estão no `deploy/Caddyfile` para Heartbeat OCPP.

URL no painel do carregador:

```
wss://ocpp.seudominio.com/ocpp/EVSE-CUIABA-001
```

Subprotocolo: `ocpp1.6`. Auth: HTTP Basic `identity:secret`.

## Variáveis no servidor

Copie `.env.production.example` → `.env.production` **só no VPS** (gitignored).

Obrigatórias:

- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥32 chars, não use o exemplo)
- `DATABASE_URL` (pooler) e `DIRECT_URL` (direto)
- `CORS_ORIGINS` com Admin e Driver HTTPS
- `NEXT_PUBLIC_API_URL=https://api.seudominio.com/api`
- `API_INTERNAL_URL=http://api:3001/api`
- `EXPO_PUBLIC_API_URL=https://api.seudominio.com/api`
- `OCPP_PUBLIC_URL=wss://ocpp.seudominio.com/ocpp`
- `COOKIE_SECURE=true`
- `PAYMENT_PROVIDER=mock` até você decidir
- `ACME_EMAIL`, `API_HOST`, `OCPP_HOST`, `ADMIN_HOST`, `APP_HOST`

Nunca coloque secrets no Git.

## Migrations em produção

Prisma **6.x** do repo. Comando seguro:

```bash
pnpm --filter @evcharge/database exec prisma migrate deploy
```

Use `DIRECT_URL` (sem PgBouncer) para o CLI. A API continua em `DATABASE_URL`.

Não use `migrate reset`, `migrate dev` nem `db push --accept-data-loss` em produção.

Se o banco já foi atualizado no passado com `db push` e a tabela `_prisma_migrations` estiver atrasada, **não** rode `migrate deploy` no escuro (as SQL podem tentar criar o que já existe). Nesse caso, faça baseline (`prisma migrate resolve --applied <nome>`) só depois de conferir que o schema já está igual. Banco novo: `migrate deploy` do zero.

## Passos para ficar online

1. Comprar/apontar o domínio e os 4 hosts acima.
2. Provisionar o VPS, abrir 80/443, clonar o repositório, copiar `.env.production`.
3. Rodar `docker compose -f docker-compose.production.yml --env-file .env.production up -d --build`.
4. Aplicar `prisma migrate deploy` contra `DIRECT_URL`.
5. Conferir `https://api.seudominio.com/api/health` e `/api/docs`.
6. Login Admin, gerar credencial OCPP, configurar o carregador físico com WSS.

Detalhe operacional: [docs/production-checklist.md](production-checklist.md) e [docs/manual/charger-installation.md](manual/charger-installation.md).

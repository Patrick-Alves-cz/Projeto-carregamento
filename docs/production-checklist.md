# Checklist de produção (beta)

Use antes do primeiro carregador físico em campo. Não substitui um pentest.

## DNS e TLS

- [ ] Domínio próprio
- [ ] `api.` A/CNAME no VPS
- [ ] `ocpp.` A/CNAME no **mesmo** VPS
- [ ] `admin.` e `app.`
- [ ] HTTPS (Caddy/Let’s Encrypt)
- [ ] WSS em `wss://ocpp…/ocpp/{identity}` (não `ws://` na rua)
- [ ] Upgrade WebSocket no proxy (Caddy já faz)
- [ ] Portas 80/443 abertas; 3001 **não** precisa ficar público se o Caddy faz reverse proxy

## Banco

- [ ] PostgreSQL existente (Supabase ou gerenciado) — **não** Prisma Postgres Cloud
- [ ] `DATABASE_URL` (pooler) e `DIRECT_URL` (direto)
- [ ] `prisma migrate deploy` aplicado (nunca `reset` em produção)
- [ ] Backup automático do provedor ligado

## Secrets

- [ ] `.env.production` **fora** do Git
- [ ] JWT access/refresh ≥32 chars, diferentes, não são os placeholders
- [ ] Sem senha, API key Asaas, secret OCPP, PAN ou CVV no repositório
- [ ] Seed `DemoCharger@12345` **não** usado em campo

## App

- [ ] `CORS_ORIGINS` com origens HTTPS reais
- [ ] `COOKIE_SECURE=true`
- [ ] `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL` públicos
- [ ] `API_INTERNAL_URL=http://api:3001/api` no Docker
- [ ] `OCPP_PUBLIC_URL=wss://ocpp.seudominio.com/ocpp`
- [ ] `CHARGER_PROVIDER_TYPE=mock` (padrão; chargers OCPP usam `providerId=ocpp16`)
- [ ] `PAYMENT_PROVIDER=mock` até você decidir
- [ ] Asaas: `sandbox` até credenciais de produção
- [ ] Webhook Asaas apontando para a URL HTTPS pública
- [ ] Rate limit global ativo; health e webhooks sem throttle
- [ ] Swagger `/api/docs` conferido (desligue com `SWAGGER_ENABLED=false` se não quiser público)

## Operação

- [ ] `GET /api/health` → `ok` + database connected
- [ ] Logs sem secrets
- [ ] Monitoramento mínimo (Uptime do `/api/health` + disco do VPS)
- [ ] Reconciliação financeira acessível no Admin
- [ ] Watchdog OCPP (180s) entendido pela operação

## Smoke test

- [ ] Login Admin e Driver
- [ ] Estação + charger demo ou físico
- [ ] Simulador ou equipamento `ocppOnline=true`
- [ ] Start → MeterValues → Stop → recibo
- [ ] Reserva e waitlist no fluxo feliz
- [ ] PIX mock/sandbox confirma
- [ ] Refund de teste só em sandbox

Quando todos os itens críticos de DNS/WSS/secrets/smoke estiverem ok, o beta pode receber o primeiro carregador físico de homologação.

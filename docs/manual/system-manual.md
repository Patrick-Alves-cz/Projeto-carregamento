# Manual do sistema EV Charge

Manual técnico e operacional do beta. Complementa os fluxos em `docs/architecture/` e o deploy em `docs/deploy.md`.

## 1. Visão geral

EV Charge opera uma rede de recarga: motoristas encontram estações, autorizam pagamento, iniciam a sessão; operadores gerem equipamentos OCPP 1.6J, incidentes e o financeiro.

Estado atual: **BETA FUNCIONAL**. Mock é o provider padrão de carregador e de pagamento. Asaas permanece em **sandbox** até existirem credenciais de produção. OCPP implementado: **1.6J**.

## 2. Arquitetura

Monorepo pnpm + Turborepo.

- `apps/api` — NestJS: REST `/api`, Socket.IO `/realtime`, OCPP `/ocpp/:identity`
- `apps/admin` — Next.js (cookies httpOnly via BFF)
- `apps/driver` — Expo (Bearer JWT)
- `apps/charger-simulator` — Charge Point OCPP de laboratório
- `packages/database` — Prisma 6 + PostgreSQL (Supabase ou Postgres local)
- `packages/domain` — regras e transições de estado
- `packages/ocpp` — framing e schemas 1.6J
- `packages/charger-provider` — Mock + OCPP
- `packages/payment-provider` — Mock + Asaas

Diagramas: [architecture/overview.md](../architecture/overview.md).

## 3. Usuários

Contas em `User` + `UserProfile`. Registro público cria só `DRIVER`. Operadores/admins entram por convite ou seed.

Senha demo (somente desenvolvimento): `Demo@12345`.

## 4. Empresas

`Company` é o tenant comercial (CNPJ, nome, status). Estações, tarifas, chargers e membros pertencem a uma empresa.

## 5. Multi-tenant

`TenantAccessService`: OPERATOR/ADMIN veem só a empresa; SUPER_ADMIN vê tudo; DRIVER não administra rede. Comandos OCPP e financeiro respeitam o mesmo recorte.

## 6. Driver

App Expo: mapa, estações, sessão ao vivo, carteira, reservas, fila, favoritos. Ver [driver-manual.md](driver-manual.md).

## 7. Admin

Painel Next: operação, cadastros, OCPP, pagamentos, reconciliação. Ver [admin-manual.md](admin-manual.md).

## 8. Estações

`Station`: endereço, geo, horários, status, empresa. Motoristas listam/filtram; operadores CRUD na própria empresa.

## 9. Chargers

`Charger`: `serialNumber` único, `identity` OCPP, `providerId` (`mock` ou `ocpp16`), health, lastSeen. Overlay `ocppOnline` vem da conexão ao vivo, não só do banco.

## 10. Connectors

`Connector` numerado por charger. Status interno mapeado do OCPP. O número **precisa** coincidir com o `connectorId` do equipamento.

## 11. Tarifas

`Tariff` por empresa (R$/kWh, minuto, idle, connection, saldo mínimo). No start da sessão o backend grava `tariffSnapshot`. Cotação: `GET /tariffs/quote`.

## 12. Carteira

`Wallet.balanceCents`. Hold não reduz o saldo até o capture. PIX credita carteira; a sessão usa hold.

## 13. PIX

Via `PaymentProvider` (mock ou Asaas sandbox). QR/copia-e-cola. Confirmação por webhook (ou simulate no mock). Sem PAN.

## 14. Cartão

Tokenizado no provider. A API guarda marca, last4, validade — **nunca PAN/CVV**. Pré-autorização quando o provider suporta.

## 15. Pagamentos

`Payment` + métodos salvos + webhooks idempotentes. Default `PAYMENT_PROVIDER=mock`.

## 16. Reservas

Janela horária no conector/estação, buffer, check-in antecipado, graça. Ver `docs/reservations.md`.

## 17. Waitlist

Fila quando o conector está ocupado; claim em `WAITLIST_CLAIM_MINUTES`.

## 18. Sessões

Ciclo completo em [session-lifecycle.md](../architecture/session-lifecycle.md). Idempotência de start/stop (`Idempotency-Key`).

## 19. Billing

Authorize antes do RemoteStart; capture após StopTransaction. [billing-flow.md](../architecture/billing-flow.md).

## 20. OCPP

Gateway no mesmo processo da API. [ocpp.md](../ocpp.md) e [charger-installation.md](charger-installation.md).

## 21. Telemetria

`MeterValue` por sessão; eventos `session.telemetry` no realtime (payload sanitizado).

## 22. Incidentes

Abertos por falha, comunicação, pagamento, OCPP. Operador reconhece/resolve. Ver `docs/incidents.md`.

## 23. Health

Score do charger (reconnects, timeouts). `HEALTHY` / `DEGRADED` / etc. Independente de `ocppOnline`. `docs/charger-health.md`.

## 24. Manutenção

Janelas `MaintenanceWindow`; connector pode ficar UNAVAILABLE. Demo-actions mock não se aplicam a OCPP.

## 25. Reconciliação

Operacional (sessão presa) e financeira (`PaymentReconciliationCase`). Watchdog **não** encerra sessão sozinho.

## 26. Auditoria

`AuditLogger` redige secret/token/hash. `SecurityEvent` para OCPP desconhecido/credencial inválida. Comandos OCPP exigem `confirm: true`.

## 27. Notificações

Módulo interno (sessão, reserva, fila). Canal in-app; não assume SMS/e-mail de produção neste beta.

## 28. Segurança

JWT ≥32 chars; refresh rotacionado; RBAC; rate limit 100/min (auth mais baixo); CORS explícito; cookies httpOnly; webhook assinado quando há secret; OCPP Basic + bcrypt; `trust proxy` atrás do Caddy.

## 29. Logs

Logs estruturados na API. Não logar PAN, CVV, JWT, secret OCPP, `PAYMENT_API_KEY`.

## 30. Deploy

VPS + Caddy + WSS. [deploy.md](../deploy.md) e [production-checklist.md](../production-checklist.md).

## 31. Troubleshooting

[troubleshooting.md](troubleshooting.md).

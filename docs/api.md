# API EV Charge

Swagger interativo: **http://localhost:3001/api/docs** (produção: `https://api.seudominio.com/api/docs`).

Prefixo: `/api`. Auth: `Authorization: Bearer` ou cookie `evcharge_access`.  
Start/stop de sessão: header `Idempotency-Key`.

OCPP **não** está no Swagger de HTTP: é WebSocket `GET` upgrade em `/ocpp/{identity}`.

## AUTH

| Método | Caminho | Notas |
|---|---|---|
| POST | `/auth/register` | Só DRIVER |
| POST | `/auth/login` | |
| POST | `/auth/refresh` | Rotação de refresh |
| POST | `/auth/logout` | |
| GET | `/auth/me` | |
| POST | `/auth/forgot-password` | |
| POST | `/auth/reset-password` | |

## DRIVER

Perfis, veículos, estações públicas, sessões próprias, carteira, reservas, fila, favoritos, notificações — os endpoints abaixo nas seções correspondentes.

## ADMIN

CRUD de empresa/estação/charger/tarifa, operação ao vivo, incidentes, manutenção, OCPP, financeiro. Papéis OPERATOR+.

## STATIONS

`GET/POST /stations` · `GET/PATCH /stations/:id` — geo/status; operador limitado à empresa.

## CHARGERS

`GET/POST /chargers` · `GET/PATCH /chargers/:id`  
`POST /chargers/:id/demo-action` — só mock  
`GET /chargers/:id/ocpp` · `POST /chargers/:id/ocpp/command` · `POST /chargers/:id/ocpp/credential`

## SESSIONS

`POST /sessions/start` · `POST /sessions/:id/stop|pause|resume`  
`GET /sessions` · `GET /sessions/:id` · `GET /sessions/active/live`

## PAYMENTS

`POST /payments` · `GET /payments/capabilities` · `POST /payments/:id/simulate` (mock)  
`POST /payments/:id/refund` · `POST /payments/webhooks/:provider`

## WALLET

`GET /wallet` · `GET /wallet/transactions` · `POST /wallet/top-up`

## RESERVATIONS

`POST /reservations` · `GET /reservations/me` (e listagens admin)

## WAITLIST

`POST /waitlist` · `POST /waitlist/:id/claim` · `GET/POST /favorites`

## FINANCE

`GET /finance/summary` · `GET /finance/reconciliation` (e detalhe/resolve conforme o controller)

## OCPP

WebSocket `wss://host/ocpp/{identity}` — ver [ocpp.md](ocpp.md). HTTP admin na seção Chargers.

## HEALTH

`GET /health` — público, sem throttle. `{ status, services.database }`.

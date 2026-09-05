# Reservas e fila

Reservas e waitlist são regras de domínio. OCPP 1.6J continua independente: `RESERVED` é status interno do conector, não um status OCPP.

## Reserva

Estados: `PENDING`, `CONFIRMED`, `ACTIVE`, `COMPLETED`, `CANCELLED`, `EXPIRED`, `NO_SHOW`.

Campos: user, company, station, connector opcional, vehicle, start/end, grace, expires.

Regras:

- Conflito no mesmo conector é bloqueado com `SELECT … FOR UPDATE`.
- Conector `OFFLINE` ou `FAULTED` não aceita reserva.
- Veículo incompatível é rejeitado.
- Estação inativa é rejeitada.

Quando chega o horário (`RESERVATION_GRACE_MINUTES`, padrão 15):

- conector `AVAILABLE` → `RESERVED`
- motorista inicia sessão → `PREPARING` → `ACTIVE`
- `StopTransaction` / stop → reserva `COMPLETED` e conector `AVAILABLE`

No-show: após a graça, status `NO_SHOW` e o conector volta a `AVAILABLE`. Não há multa automática nesta fase.

## Fila

Estados: `WAITING`, `NOTIFIED`, `CLAIMED`, `EXPIRED`, `CANCELLED`.

Quando o conector fica disponível, o backend notifica o primeiro da fila (evento interno + notificação in-app). A janela de claim é `WAITLIST_CLAIM_MINUTES` (padrão 5). Sem polling agressivo.

## Endpoints

- `POST /api/reservations`
- `GET /api/reservations/me`
- `GET /api/reservations` (admin)
- `POST /api/reservations/:id/cancel`
- `POST /api/waitlist`
- `GET /api/waitlist/me`
- `GET /api/waitlist` (admin)
- `POST /api/waitlist/:id/claim`
- `POST /api/favorites`

## Variáveis

```
RESERVATION_GRACE_MINUTES=15
WAITLIST_CLAIM_MINUTES=5
```

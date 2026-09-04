# OCPP 1.6J

A Fase 4 adiciona um gateway OCPP **separado** do WebSocket do frontend. O domínio de sessão continua falando com `ChargerProvider`. OCPP é um adapter.

## Arquitetura

```
Charge Point (físico ou simulador)
        │  WebSocket ocpp1.6
        ▼
OcppWsServer  (/ocpp/:identity)
        │
OcppAuthService (identity + credential hash)
        │
OcppConnectionManager
        │
OcppMessageRouter  → handlers (Boot, Heartbeat, Status, Authorize, Start/Stop, Meter)
        │
OcppInboundService  → Prisma + SessionsService + MeterService
        │
OcppChargerProvider ← RemoteStart / RemoteStop / Reset / ChangeAvailability
        │
Sessions / Wallet / Receipts / Domain events
        │
Frontend WebSocket `/realtime` (payload sanitizado)
```

```
ChargerProvider
├── MockChargerProvider   (default, testes Fase 1–3)
└── OcppChargerProvider   (chargers com providerId = ocpp16)
```

O domínio **não** importa tipos OCPP. Mapeamento fica em `@evcharge/ocpp`.

## Transporte

- URL: `ws://localhost:3001/ocpp/{identity}`
- Subprotocolo: `ocpp1.6`
- Auth: HTTP Basic `identity:secret`
- Segredo **nunca** é persistido em texto puro (`ChargerCredential.credentialHash`)
- Uma conexão operacional por charger; reconexão substitui a anterior

O WebSocket OCPP **não** é o Socket.IO do admin/driver (`/realtime`).

## Mensagens implementadas

Do carregador (CALL):

| Mensagem | Efeito interno |
|---|---|
| BootNotification | vendor/model/firmware, lastSeen, Accepted |
| Heartbeat | lastSeenAt |
| StatusNotification | mapeia para status interno do connector/charger |
| Authorize | valida `idTag` da plataforma |
| StartTransaction | cria `OcppTransaction`, sessão → ACTIVE |
| MeterValues | `MeterValue` + custo + evento `session.telemetry` |
| StopTransaction | encerra sessão, recibo, débito |

Do backend (CALL):

| Mensagem | Origem |
|---|---|
| RemoteStartTransaction | Driver start **ou** admin |
| RemoteStopTransaction | Driver/Admin stop |
| Reset | Admin |
| ChangeAvailability | Admin (preparado) |

Não implementado nesta fase: OCPP 2.0.1 / 2.1, demais comandos 1.6.

## Estados

OCPP `Available`, `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing`, `Unavailable`, `Faulted` são mapeados para o modelo interno (`AVAILABLE`, `PREPARING`, `CHARGING`, `PAUSED`/`SUSPENDED`, `FINISHING`, `UNAVAILABLE`, `FAULTED`). O schema interno **não** copia strings OCPP.

Sessão só fica `ACTIVE` após `StartTransaction` (OCPP). No mock, o start continua imediato.

Encerramento financeiro só após `StopTransaction`, não após o envio de `RemoteStopTransaction`.

## Segurança

- Credencial de equipamento ≠ JWT de usuário
- Multi-tenant: Company A não comanda charger da Company B
- Driver não envia comandos OCPP
- SUPER_ADMIN vê todos os carregadores
- Logs estruturados; secrets, JWT e hashes são redigidos
- Mensagem malformada responde CALLERROR e **não** derruba a API

## Reconciliação

`OcppWatchdog` marca OFFLINE se `lastSeenAt` passar do threshold (`OCPP_OFFLINE_THRESHOLD_MS`, default 180s), mesmo sem evento `close` do WebSocket.

`OcppReconciliationService` registra `session.needs_reconciliation` quando há sessão ACTIVE/PREPARING/PAUSED e o charger OCPP está desconectado. **Não** encerra a sessão só porque o frontend ou o socket caiu.

## Como testar

1. `pnpm db:seed` — cria `EVSE-CUIABA-001` OFFLINE + secret `DemoCharger@12345`
2. `pnpm --filter @evcharge/api dev`
3. `pnpm charger:simulator`
4. Admin → Carregadores → o charger deve ficar ONLINE após BootNotification
5. Driver inicia recarga no conector CCS2 da estação de Cuiabá
6. Simulador recebe RemoteStart, envia StartTransaction + MeterValues
7. Driver vê telemetria; Admin vê CHARGING
8. Driver stop → RemoteStop → StopTransaction → recibo e débito da wallet

```bash
CHARGER_ID=EVSE-CUIABA-001 \
OCPP_URL=ws://localhost:3001/ocpp \
CHARGER_SECRET=DemoCharger@12345 \
pnpm charger:simulator
```

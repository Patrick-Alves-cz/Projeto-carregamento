# OCPP 1.6J no EV Charge

## O que é OCPP

OCPP (Open Charge Point Protocol) é o protocolo aberto entre um **Charge Point** (carregador) e um **CSMS** (sistema de gestão — neste projeto, a API EV Charge).

Usamos **OCPP 1.6 JSON** (1.6J) sobre **WebSocket**. Não implementamos OCPP 2.0.1 nesta versão.

Por que 1.6J: a maioria dos carregadores AC/DC comerciais no Brasil ainda fala 1.6 JSON. É o protocolo estável deste beta.

## Papéis

| Termo | Significado aqui |
|---|---|
| Charge Point | Equipamento físico ou `apps/charger-simulator` |
| CSMS / backend | `OcppWsServer` + handlers na API |
| Connector | Tomada numerada (1, 2, …) mapeada para `Connector` no banco |
| Transaction | Ciclo StartTransaction → MeterValues → StopTransaction (`OcppTransaction`) |
| idTag | Identificador OCPP da autorização (gerado pela plataforma, máx. 20 chars) |
| MeterValues | Amostras de energia/potência durante a sessão |
| Heartbeat | “Estou vivo” periódico |
| Boot | Primeira mensagem após conectar |

O domínio de sessão fala com `ChargerProvider`. OCPP é um **adapter** (`OcppChargerProvider`). Mock (`MockChargerProvider`) continua o padrão (`CHARGER_PROVIDER_TYPE=mock`).

## Transporte

- Local: `ws://localhost:3001/ocpp/{identity}`
- Internet: `wss://ocpp.seudominio.com/ocpp/{identity}`
- Subprotocolo: `ocpp1.6`
- Auth: HTTP Basic `identity:secret` (secret só em hash bcrypt)
- Uma conexão operacional por charger; reconexão substitui a anterior
- Path **fora** de `/api` (upgrade HTTP cru)

Não confundir com Socket.IO `/realtime` (Admin/Driver).

## Framing: CALL, CALLRESULT, CALLERROR

OCPP 1.6J usa arrays JSON:

| Tipo | Formato | Uso |
|---|---|---|
| **CALL** | `[2, uniqueId, action, payload]` | Pedido (charger→CSMS ou CSMS→charger) |
| **CALLRESULT** | `[3, uniqueId, payload]` | Resposta de sucesso ao mesmo `uniqueId` |
| **CALLERROR** | `[4, uniqueId, errorCode, errorDescription, errorDetails]` | Payload inválido ou ação recusada |

Mensagem malformada gera CALLERROR e **não** derruba a API.

## Mensagens implementadas

| Mensagem OCPP | Direção | Função | Quando acontece |
|---|---|---|---|
| BootNotification | Charge Point → CSMS | Identifica vendor/model/firmware; CSMS responde `Accepted` + intervalo de heartbeat | Ao conectar / após reset |
| Heartbeat | Charge Point → CSMS | Atualiza `lastSeenAt` | Periódico (`OCPP_HEARTBEAT_INTERVAL_SEC`, default 60s) |
| StatusNotification | Charge Point → CSMS | Atualiza status do connector/charger | Sempre que o hardware muda de estado |
| Authorize | Charge Point → CSMS | Valida `idTag` emitido pela plataforma | Antes de StartTransaction local ou após RemoteStart |
| StartTransaction | Charge Point → CSMS | Cria `OcppTransaction`; sessão → **ACTIVE** | Cabo autenticado e energia pode fluir |
| MeterValues | Charge Point → CSMS | Energia, potência, opcionalmente V/A/SoC | Durante a transação |
| StopTransaction | Charge Point → CSMS | Encerra transação; evidência física de fim; dispara billing | Fim da carga ou RemoteStop honrado |
| RemoteStartTransaction | CSMS → Charge Point | Pede início remoto com `idTag` + connectorId | Driver/Admin start **depois** da autorização financeira |
| RemoteStopTransaction | CSMS → Charge Point | Pede parada remota | Driver/Admin stop; **não** captura pagamento sozinho |
| Reset | CSMS → Charge Point | Soft/Hard reset | Comando admin com confirmação |
| ChangeAvailability | CSMS → Charge Point | Operative / Inoperative | Comando admin; timeout e reconciliação se o charger não responder |

Não implementado: OCPP 2.0.1 / 2.1 e o restante do 1.6 (GetConfiguration, firmware, smart charging, etc.).

## Estados

Strings OCPP (`Available`, `Preparing`, `Charging`, `SuspendedEV`, `SuspendedEVSE`, `Finishing`, `Unavailable`, `Faulted`) são **mapeadas** para o modelo interno. O schema Prisma **não** armazena os nomes OCPP crus como enum de sessão.

- Sessão `ACTIVE` só após `StartTransaction` (OCPP).
- Encerramento financeiro só após `StopTransaction`.
- No mock, o start pode ser imediato (demo).

## Segurança e multi-tenant

- Credencial de equipamento ≠ JWT de usuário
- Company A não comanda charger da Company B
- DRIVER não envia comandos OCPP
- SUPER_ADMIN vê todos os carregadores
- Logs redigem secret, JWT e hashes
- Geração/rotação: `POST /api/chargers/:id/ocpp/credential` (secret em texto **uma vez**)

## Watchdog e health

`OcppWatchdog` marca OFFLINE se `lastSeenAt` passar de `OCPP_OFFLINE_THRESHOLD_MS` (180s), mesmo sem `close` do socket. Health interno (`HEALTHY`/`DEGRADED`) é separado do bit `ocppOnline`. Ver [charger-health.md](charger-health.md).

## Como testar localmente

```bash
pnpm db:seed   # EVSE-CUIABA-001 + secret DemoCharger@12345
pnpm --filter @evcharge/api dev
CHARGER_ID=EVSE-CUIABA-001 \
OCPP_URL=ws://localhost:3001/ocpp \
CHARGER_SECRET=DemoCharger@12345 \
pnpm charger:simulator
```

Fluxo completo: [architecture/charging-flow.md](architecture/charging-flow.md) · instalação física: [manual/charger-installation.md](manual/charger-installation.md)

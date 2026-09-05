# Operação (Fase 6)

A Fase 6 adiciona saúde do carregador, confiabilidade, incidentes, manutenção e fila inteligente **sem alterar o protocolo OCPP**. OCPP continua sendo a camada de equipamento.

## Jobs internos (API)

O `OperationsScheduler` roda a cada 30s:

- recálculo de health
- detecção de incidentes
- ciclo de manutenção
- casos de reconciliação
- timeout de comandos
- idle fee
- snapshot de reliability
- retenção de eventos PROTOCOL

## Comandos

`ChargerCommand` registra RemoteStart, RemoteStop, Reset e ChangeAvailability com estados `QUEUED → SENT → ACCEPTED|REJECTED|TIMEOUT|FAILED`.

O Admin não altera só o banco: ChangeAvailability passa pelo `ChargerProvider` / OCPP. Se o comando expirar, o estado fica `TIMEOUT` para reconciliação.

## Manutenção

`MaintenanceWindow` em `ACTIVE` bloqueia novas sessões e reservas. O Driver vê “Temporariamente indisponível para manutenção.”

## Fila e reserva

- Fila por conector, tipo ou estação
- ETA aproximada (`~10 min`, `~20–30 min`, `tempo indisponível`)
- `RESERVATION_BUFFER_MINUTES` impede oferecer um conector da fila se houver reserva próxima
- Check-in: `RESERVATION_EARLY_CHECKIN_MINUTES` antes até `RESERVATION_GRACE_MINUTES` depois

## Idle fee

Quando o conector vai para FINISHING/SUSPENDED com sessão ACTIVE, a sessão vira `CHARGING_COMPLETE`. Após `IDLE_GRACE_MINUTES`, vira `IDLE` e o `PricingService` passa a contar `idleMinutes`.

## Retenção de eventos

- `OPERATIONAL`: timeline (conectado, boot, comando, incidente)
- `PROTOCOL`: logs excessivos, removidos após `CHARGER_EVENT_PROTOCOL_RETENTION_DAYS` (default 7)
- Heartbeats **não** viram `ChargerEvent`
- Frames OCPP completos **não** são persistidos

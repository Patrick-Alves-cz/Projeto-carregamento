# Incidentes

Incidentes são operacionais. Não substituem StatusNotification.

## Modelo

`Incident`: company, station, charger, connector opcional, session opcional, type, severity, status, título, descrição, source, firstSeenAt, lastSeenAt, resolution.

Deduplicação: `openKey = type:chargerId:connectorId:sessionId`. Novo evento **atualiza `lastSeenAt`**. Resolução zera `openKey` para permitir reabrir depois.

## Tipos e severidade

Tipos: `CHARGER_OFFLINE`, `CONNECTOR_FAULT`, `SESSION_FAILURE`, `REMOTE_START_FAILURE`, `REMOTE_STOP_FAILURE`, `COMMUNICATION_LOSS`, `PAYMENT_FAILURE`, `RESERVATION_FAILURE`, `METERING_ANOMALY`, `UNKNOWN`.

Severidade: `INFO`, `WARNING`, `HIGH`, `CRITICAL`.

Status: `OPEN`, `ACKNOWLEDGED`, `RESOLVED`, `IGNORED`.

## Detecção automática

- charger offline além do threshold
- conector FAULTED
- telemetria ausente / sessão ativa com charger offline (também abre `ReconciliationCase`)
- anomalia de MeterValues (não encerra a sessão)

Recuperação de offline resolve o incidente aberto e notifica operadores + motoristas com a estação nos favoritos.

## Multi-tenant

Company A não lista, reconhece nem resolve incidentes da B. Motorista recebe 403 em `/incidents`.

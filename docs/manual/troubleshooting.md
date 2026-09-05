# Troubleshooting

## Carregador não aparece online

**Sintoma:** Admin mostra OFFLINE; `ocppOnline=false`.

**Possíveis causas:** simulador/físico não iniciado; identity errada; secret antigo; URL ws em vez de wss (ou o contrário); firewall.

**Investigar:** logs da API (`ocpp.auth`); `GET /api/chargers/:id/ocpp`; no equipamento, status da conexão CSMS.

**Resolver:** conferir identity, gerar nova credencial se rotacionou, apontar `wss://ocpp.../ocpp/{identity}`, subprotocolo `ocpp1.6`.

## Carregador aparece offline

**Sintoma:** já esteve online e caiu.

**Causas:** queda de rede; watchdog (`OCPP_OFFLINE_THRESHOLD_MS`); processo da API reiniciou; uma segunda conexão substituiu a primeira.

**Investigar:** `lastSeenAt`; Heartbeat; dois clientes com a mesma identity.

**Resolver:** um socket por identity; restaurar rede; conferir Heartbeat 60s.

## OCPP não conecta

**Sintoma:** handshake 401 ou timeout.

**Causas:** Basic auth ausente; identity da URL ≠ usuário; TLS interceptado; proxy sem upgrade WebSocket; path sem `/ocpp/`.

**Investigar:** Caddy/access log; teste `wss://` com o simulador apontando para o host público.

**Resolver:** `deploy/Caddyfile` (flush_interval / read_timeout 0); passar header `Authorization`.

## BootNotification não chegou

**Sintoma:** socket sobe mas vendor/firmware vazios; eventos OCPP vazios.

**Causas:** equipamento em SOAP/1.5; subprotocolo recusado; payload inválido (CALLERROR).

**Investigar:** `chargerEvent`; logs `ocpp`.

**Resolver:** forçar OCPP 1.6 JSON; corrigir identity; ver CALLERROR.

## Connector está UNAVAILABLE

**Sintoma:** motorista não inicia.

**Causas:** StatusNotification Unavailable; manutenção; ChangeAvailability Inoperative; ainda não houve Status após boot (seed começa UNAVAILABLE).

**Investigar:** último StatusNotification; janela de manutenção.

**Resolver:** Disponibilizar no Admin; esperar Status `Available`.

## RemoteStart foi rejeitado

**Sintoma:** sessão não sai de PREPARING; `accepted=false`.

**Causas:** conector ocupado/faulted; idTag; charger offline; pagamento não autorizado; charger recusou.

**Investigar:** comando em `chargerCommand`; saldo/hold; status do connector.

**Resolver:** liberar conector; conferir envelope de pagamento; não iniciar sem `ocppOnline`.

## RemoteStop não funcionou

**Sintoma:** app pediu parada, energia continua.

**Causas:** timeout OCPP; transação id errada; cabo preso; `remoteStopPending` sem StopTransaction.

**Investigar:** se RemoteStop foi Accepted; se StopTransaction chegou.

**Resolver:** repetir stop; Reset só se o procedimento operacional permitir; reconciliação se a sessão ficar presa.

## Session ficou ACTIVE

**Sintoma:** ACTIVE sem o motorista “ver” energia (ou ACTIVE inesperado).

**Causas:** StartTransaction chegou (correto); mock start imediato; sessão órfã se MeterValues param.

**Investigar:** `OcppTransaction`; `lastMeterAt`; watchdog.

**Resolver:** ACTIVE após StartTransaction é esperado. Sem meter, tratar comunicação — não “forçar COMPLETED” no frontend.

## MeterValues não chegam

**Sintoma:** kWh zerado com sessão ACTIVE.

**Causas:** intervalo de meter no equipamento; mapped measurands; simulador com intervalo alto.

**Investigar:** eventos `session.telemetry`; tabela `meter_values`.

**Resolver:** habilitar Energy.Active.Import.Register (ou equivalente) no carregador; conferir simulador.

## Pagamento não confirmou

**Sintoma:** Payment PENDING eterno.

**Causas:** mock sem `simulate`; Asaas sandbox; webhook não chegou; assinatura inválida.

**Investigar:** `PaymentWebhookEvent`; `/api/payments/capabilities`.

**Resolver:** mock: simulate; Asaas: URL pública de webhook + secret.

## PIX não creditou

**Sintoma:** pago no banco, saldo igual.

**Causas:** webhook duplicado ignorado (ok) vs nunca processado; `walletCredited` já true; providerRef não bate.

**Investigar:** payment status; reconciliação financeira.

**Resolver:** não creditar na mão sem caso; abrir `PaymentReconciliationCase`.

## Webhook não chegou

**Sintoma:** gateway pago, API PENDING.

**Causas:** URL `localhost`; HTTPS inválido; throttle (health/webhooks estão com SkipThrottle); secret errado (401).

**Investigar:** painel Asaas tentativas; logs 401.

**Resolver:** `https://api.seudominio.com/api/payments/webhooks/asaas`.

## Refund não processou

**Sintoma:** estorno pendente.

**Causas:** provider recusou; sem `refundIdempotencyKey` estável; papel DRIVER.

**Investigar:** status `REFUND_PENDING`; audit.

**Resolver:** repetir com o mesmo idempotency; conferir papel ADMIN/OPERATOR.

## Health está DEGRADED

**Sintoma:** online mas health ruim.

**Causas:** reconexões do simulador/testes; timeouts de comando; não é bug de billing.

**Investigar:** `docs/charger-health.md`; reliabilityScore.

**Resolver:** conexão estável; ignorar DEGRADED após bateria de testes locais se lastSeen está fresco.

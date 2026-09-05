# Saúde e confiabilidade do carregador

OCPP `StatusNotification` **não** define sozinho se o carregador está saudável.

## Freshness (`communicationFreshness`)

| Estado | Critério |
|---|---|
| LIVE | Conectado e última mensagem ≤ 90s |
| RECENT | Última mensagem ≤ 5 min |
| STALE | Última mensagem ≤ 15 min |
| OFFLINE | Sem comunicação recente |

## Health (interno, não é estado OCPP)

Prioridade:

1. `MAINTENANCE` — janela ativa
2. `OFFLINE` — freshness OFFLINE ou status OFFLINE
3. `FAULTED` — charger FAULTED ou todos os conectores FAULTED
4. `UNSTABLE` — ≥5 reconexões/24h, ≥3 comandos falhos/hora, ou ≥50% falhas de sessão (n≥3)
5. `DEGRADED` — comunicação STALE, falha parcial, incidente HIGH aberto, reconciliação pendente
6. `HEALTHY` — restante

## Reliability 0–100

```
score = round(
  35 * uptimeRate +
  30 * successfulSessionsRate +
  25 * commandSuccessRate +
  10 * recoveryRate
) - faultPenalty
```

`faultPenalty = min(40, 5*falhasDeConector + 3*offline + 4*remoteStartFalhos + 2*remoteStopFalhos)`

Snapshot diário em `ChargerReliabilitySnapshot`. O GET da estação lê `charger.reliabilityScore` (job), não recalcula a fórmula.

## Disponibilidade da estação

Calculada no backend a partir dos conectores:

| Estado | Exemplo |
|---|---|
| AVAILABLE | 2 livres, mesmo com 1 ocupado / 1 reservado / 1 em falha |
| LIMITED | livres, mas maioria faulted/offline |
| BUSY | 0 livres e ocupados > 0 |
| RESERVED | 0 livres, só reservas |
| OFFLINE | todos offline |
| FAULTED | maioria em falha |
| MAINTENANCE | janela ou estação em manutenção |

O frontend escolhe as cores do mapa. O domínio não define paleta.

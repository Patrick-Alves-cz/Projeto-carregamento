# Manual do motorista (Driver)

App: Expo em `http://localhost:8081` (web) ou cliente nativo. API: Bearer JWT.

Contas demo: `driver1@evcharge.demo` … `driver5@evcharge.demo` / senha `Demo@12345` (só desenvolvimento).

## Cadastro e login

1. Abra o Driver → criar conta (somente papel motorista) ou entrar.
2. Tokens ficam no dispositivo (Secure Store / storage web). Refresh é automático.

## Veículo

Cadastre ao menos um veículo (placa/apelido conforme o formulário). A sessão exige `vehicleId`.

## Encontrar estação

- Mapa (MapLibre) e lista
- Filtros de status/disponibilidade quando a tela oferecer
- Toque na estação para ver conectores, potência e preço

## Preço

A cotação vem do backend (`/tariffs/quote`), não de um número fixo no app. Moeda em centavos formatada em BRL.

## Reservar

Se a estação permitir, escolha janela. Só inicie a recarga dentro da janela (com check-in antecipado configurado). Fora da janela: erro de reserva.

## Fila (waitlist)

Se o conector estiver ocupado, entre na fila. Quando for sua vez, você tem poucos minutos para reivindicar (`WAITLIST_CLAIM_MINUTES`).

## Favoritos

Marque estações para acesso rápido.

## Saldo, PIX e cartão

1. Carteira mostra saldo e disponível (saldo − holds).
2. PIX: gere cobrança, pague, aguarde confirmação (webhook ou simulate no mock). O crédito entra na carteira.
3. Cartão: tokenize no fluxo do app (sem digitar PAN na API). A recarga pode pré-autorizar um envelope e capturar o custo real no fim.

Sem saldo/autorização, **não há** RemoteStart.

## Iniciar carga

1. Estação → conector `AVAILABLE`
2. Veículo e método de pagamento
3. Confirmar

O app mostra “Preparando carregador”. **Carregando** só aparece quando o backend promove a sessão a `ACTIVE` (`StartTransaction` no OCPP, ou start mock).

## Acompanhar

kWh, potência e custo estimado atualizam via realtime. Não use esses números como comprovante fiscal — o recibo sai no capture.

## Pausar / continuar / finalizar

Pause/resume quando o conector e o provider permitirem. **Parar** pede RemoteStop; o cabo/energia param quando o carregador envia StopTransaction. O app não “fecha o caixa” sozinho.

## Recibo e histórico

Após billing, o recibo aparece na sessão. Histórico lista sessões passadas.

## Notificações

Avisos de sessão, reserva e fila no próprio app.

## Erros frequentes

| Código interno | O que o motorista vê (resumo) |
|---|---|
| CHARGER_OFFLINE | Carregador temporariamente indisponível |
| CHARGER_FAULTED / CONNECTOR_FAULT | Falha no conector; escolha outro |
| CONNECTOR_UNAVAILABLE | Ocupado ou indisponível |
| REMOTE_START_REJECTED | Não iniciou; tente de novo ou outro conector |
| REMOTE_STOP_FAILED | Não encerrou; tente de novo |
| MAINTENANCE | Manutenção |
| RESERVATION_WINDOW / RESERVATION_EXPIRED | Fora da janela / reserva vencida |
| COMMUNICATION_LOSS | Sem telemetria recente |
| PAYMENT_FAILED | Não autorizou; outro método |
| PAYMENT_REQUIRES_ACTION | Confirme o pagamento |
| PAYMENT_PENDING | Recarga registrada; cobrança ainda fechando |

Se o conector está livre no app mas o carregador está offline no Admin, o problema é OCPP — avise a operação.

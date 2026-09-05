# Pagamentos

A Fase 5 desacoplou a carteira DEMO. A Fase 7 adiciona gateway sandbox (Asaas), hold, capture e reconciliação. Ver [payment-provider.md](payment-provider.md) e [billing.md](billing.md).

O domínio fala com `PaymentProvider`. Nenhum frontend confirma pagamento ou calcula o total final.

## Arquitetura

```
Driver / Admin
    │
    ▼
API (PaymentsService, WebhookService)
    │
    ▼
PaymentProvider
├── MockPaymentProvider     (PAYMENT_PROVIDER=mock, padrão)
├── PixPaymentProvider      (interface)
└── CardPaymentProvider     (interface)
```

Gateways reais (Mercado Pago, Stripe, Pagar.me, Efí, Asaas) entram depois, sem mudar o domínio.

## Estados

`PENDING` → `AUTHORIZED` → `CONFIRMED`
também: `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`

`COMPLETED` permanece para débitos de sessão via carteira (compatível com a Fase 3).

## PIX DEMO

1. Motorista escolhe valor.
2. `POST /api/payments` com `kind=PIX`.
3. Backend cria cobrança `PENDING` e devolve copia-e-cola.
4. `POST /api/payments/:id/simulate` (somente mock) ou webhook `POST /api/payments/webhooks/:provider`.
5. Status `CONFIRMED` credita a carteira **uma única vez** (`walletCredited` + idempotency da transação).

A UI identifica o ambiente como **DEMO**. Isso não é PIX real.

## Cartão

O banco guarda apenas: provider, token, bandeira, last4, validade e status.
Número completo e CVV nunca são persistidos nem logados.
`POST /api/payment-methods` tokeniza via provider.

## Webhooks

`POST /api/payments/webhooks/:provider`

- Público.
- Se `PAYMENT_WEBHOOK_SECRET` existir, exige HMAC SHA-256 em `x-webhook-signature`.
- Eventos duplicados retornam `replayed: true`.
- Confirmação fora de ordem em pagamento `EXPIRED`/`CANCELLED`/`FAILED` é ignorada.
- Resposta rápida; crédito de carteira é idempotente.

## Sessão

A sessão continua debitando a **carteira**. PIX/cartão creditam a carteira antes.
A tarifa vigente é congelada em `tariffSnapshot` no início. `PricingService` calcula estimativa, custo corrente e custo final no backend.

## Variáveis

```
PAYMENT_PROVIDER=mock
PAYMENT_WEBHOOK_SECRET=
```

## Como testar

```bash
# criar PIX DEMO
curl -X POST http://localhost:3001/api/payments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Idempotency-Key: pix-demo-1" \
  -d '{"amountCents":2500,"kind":"PIX"}'

# confirmar no mock
curl -X POST http://localhost:3001/api/payments/$ID/simulate \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"outcome":"CONFIRMED"}'
```

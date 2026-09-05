# Webhooks de pagamento

`POST /api/payments/webhooks/:provider`

Público. O frontend **nunca** marca PIX/cartão como pago.

## Mock

- HMAC SHA-256 em `x-webhook-signature` quando `PAYMENT_WEBHOOK_SECRET` existe
- payload interno: `eventId`, `eventType`, `paymentId`/`providerRef`, `status`, `amountCents` opcional

## Asaas

- header `asaas-access-token` comparado a `PAYMENT_WEBHOOK_SECRET`
- payload do Asaas é parseado; só status, valor, ids e tipo entram no banco
- depois do webhook, a API consulta o gateway antes de creditar (quando `PAYMENT_PROVIDER=asaas`)

## Segurança

- valida provider
- valida assinatura/token
- valida event id (único por provider)
- valida payment id / providerRef
- confere valor e moeda
- confere empresa do pagamento
- impede duplicidade (`replayed: true`)
- registra audit sem token, PAN, CVV, secret ou assinatura completa

Valor divergente abre `PaymentReconciliationCase` (`AMOUNT_MISMATCH`) e **não** credita a carteira.

`PaymentWebhookEvent` guarda evento sanitizado: provider, eventId, tipo, providerPaymentId, status, erro sanitizado, receivedAt/processedAt.

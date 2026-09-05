# Reconciliação financeira

`PaymentReconciliationService` compara o livro interno com o gateway.

Job periódico (~60s) detecta:

- webhook recebido e não processado
- gateway `CONFIRMED`/`REFUNDED` com status interno pendente
- refund divergente
- sessão `COMPLETED` com `billingStatus` `AUTHORIZED` ou `PAYMENT_FAILED` (cobrança não liquidada)

Pré-Fase 7 (`billingStatus=NONE`) não gera caso em massa.

## Admin

`/dashboard/finance/reconciliation` lista casos da empresa do operador. Company A não vê a B.

## Idempotência

- 1 pagamento externo → 1 crédito de carteira (`payment-credit-{paymentId}`)
- 1 sessão → 1 cobrança final (`billing-capture-{sessionId}` ou capture do cartão)
- 1 webhook → 1 processamento (`provider + externalEventId` único)
- 1 refund → 1 débito/crédito de estorno

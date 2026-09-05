# Payment provider

A Fase 7 mantém a abstração `PaymentProvider` e adiciona um gateway brasileiro real **em sandbox**.

## Escolha

**Asaas** (`PAYMENT_PROVIDER=asaas`).

Motivos:

- PIX, cartão, tokenização, webhook, consulta, refund e `authorizeOnly` + capture
- sandbox público (`https://api-sandbox.asaas.com/v3`)
- documentação pública adequada
- preferência #1 do projeto

Não há Mercado Pago, Pagar.me ou Efí nesta fase.

## Arquitetura

```
PaymentProvider
├── MockPaymentProvider     PAYMENT_PROVIDER=mock (padrão)
└── AsaasPaymentProvider    PAYMENT_PROVIDER=asaas
```

`MockPaymentProvider` permanece para testes, seed, desenvolvimento e ambientes sem credencial.

Sem `PAYMENT_API_KEY`, o Asaas **não** inventa chave: a API recusa a chamada. Mantenha `PAYMENT_PROVIDER=mock`.

## Capacidades

```
supportsPix
supportsCard
supportsCardPreAuthorization
supportsRefund
supportsSavedPaymentMethod
supportsWebhookSignature
```

O domínio não assume que todo provider faz pré-autorização. Sem preauth de cartão, a sessão cai para hold de carteira (pré-pago).

## Estados internos

O gateway nunca vaza para o domínio. Mapeamento em `packages/domain/src/finance/payment-status.ts`:

`CREATED` `PENDING` `AUTHORIZED` `PROCESSING` `PAID` `FAILED` `CANCELLED` `EXPIRED` `REFUND_PENDING` `REFUNDED` `PARTIALLY_REFUNDED`

No Prisma, `PAID` persiste como `CONFIRMED` (compatível com a Fase 5). `COMPLETED` continua para débitos internos de sessão.

## Tokenização

O backend recebe apenas `token`, `brand`, `last4`, validade. PAN e CVV nunca entram na API.

No Asaas o token vem do checkout/frontend. Sem token, `tokenizeCard` falha de propósito.

## Sandbox

```
PAYMENT_PROVIDER=mock
PAYMENT_ENVIRONMENT=sandbox
PAYMENT_API_URL=https://api-sandbox.asaas.com/v3
PAYMENT_API_KEY=
PAYMENT_WEBHOOK_SECRET=
```

Não use produção. Não cobre cartão real. Não movimente dinheiro real nesta fase.

## Envelope de autorização de sessão

Não há valor global escondido. Documentado:

- `SESSION_AUTH_ENERGY_KWH` (padrão 30)
- `SESSION_AUTH_MINUTES` (padrão 60)
- piso `max(minBalanceCents da tarifa, 1000)`

Ver [billing.md](billing.md).

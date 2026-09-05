# Cobrança por sessão

OCPP informa o que aconteceu no carregador. `SessionBillingService` cobra.

StopTransaction continua sendo a evidência de término físico. O botão Parar no app só pede RemoteStop.

## Fluxo

1. Driver escolhe conector e método (carteira, PIX via saldo, ou cartão tokenizado).
2. `PricingService` gera a tarifa vigente e uma estimativa.
3. `SessionBillingService.authorizeInTx` reserva valor **antes** do RemoteStart.
4. Sem autorização, a sessão não inicia.
5. MeterValues atualizam energia/custo. Com hold aberto **não** há débito incremental.
6. StopTransaction → custo final → capture/débito **uma vez** → recibo.

## WalletHold

Saldo R$ 100, hold R$ 40 → disponível R$ 60. O `balanceCents` não cai no hold.

No fim: consumo R$ 22 → captura 22, libera 18. Idempotência `billing-capture-{sessionId}`.

PIX no checkout da sessão **não** cria cobrança PIX na hora: PIX recarrega a carteira; a sessão usa hold de saldo. Sem saldo suficiente, o start é bloqueado.

## Cartão

Se `supportsCardPreAuthorization`:

1. `authorizeCard` no valor do envelope
2. carregamento
3. `capturePayment` no custo final
4. restante liberado no gateway

Fallback sem preauth: hold de carteira (pré-pago). Não há cobrança pós-sessão sem limite.

## Falha no pagamento final

A sessão física pode ficar `COMPLETED` com `billingStatus=PAYMENT_FAILED`.

Admin vê incidente `PAYMENT_FAILURE` e caso de reconciliação. Os dados da sessão não são apagados.

Estados visíveis ao motorista: Aguardando pagamento, Pagamento aprovado, Preparando carregador, Carregando, Finalizando cobrança, Pagamento concluído, Pagamento pendente, Pagamento falhou.

## Refund de sessão

Operador/admin informa motivo. Audit obrigatório. Idempotência em `refundIdempotencyKey`.

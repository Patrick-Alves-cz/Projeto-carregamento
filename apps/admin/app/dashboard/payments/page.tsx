"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listOpsPayments, refundPayment } from "@/lib/api-client";
import { formatCurrency, paymentStatusLabel } from "@/lib/labels";

export default function PaymentsPage() {
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [provider, setProvider] = useState("");
  const [tick, setTick] = useState(0);
  const query = useQuery(
    () =>
      listOpsPayments({
        status: status || undefined,
        method: method || undefined,
        provider: provider || undefined,
      }),
    [status, method, provider, tick],
  );
  const items = query.data ?? [];

  async function refund(id: string) {
    const reason = window.prompt("Motivo do estorno") ?? "";
    if (reason.trim().length < 5) return;
    await refundPayment(id, reason.trim());
    setTick((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status interno, provider e referência. Isolado por empresa. Sem dados de cartão.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["", "PENDING", "AUTHORIZED", "CONFIRMED", "COMPLETED", "FAILED", "EXPIRED", "REFUND_PENDING", "REFUNDED"].map(
          (item) => (
            <button
              key={item || "all"}
              className={`rounded-full border px-3 py-1 text-sm ${status === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              onClick={() => setStatus(item)}
              type="button"
            >
              {item ? paymentStatusLabel(item) : "Todos"}
            </button>
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {["", "PIX", "CARD", "WALLET_DEMO", "WALLET"].map((item) => (
          <button
            key={item || "method"}
            className={`rounded-full border px-3 py-1 text-sm ${method === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setMethod(item)}
            type="button"
          >
            {item || "Método"}
          </button>
        ))}
        {["", "mock", "asaas", "internal"].map((item) => (
          <button
            key={item || "provider"}
            className={`rounded-full border px-3 py-1 text-sm ${provider === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setProvider(item)}
            type="button"
          >
            {item || "Provider"}
          </button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimos pagamentos</CardTitle>
          <CardDescription>Motoristas e sessões de outros tenants não aparecem.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento neste filtro.</p> : null}
          {items.map((payment) => (
            <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {payment.session?.connector.charger.station.name ?? "Carteira"} ·{" "}
                  {payment.session?.user.profile?.fullName ?? "Motorista"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {paymentStatusLabel(payment.status ?? "")} · {payment.method} · {payment.provider} ·{" "}
                  {payment.providerRef ?? "sem referência"}
                </p>
                <p className="text-sm text-muted-foreground">
                  criado {new Date(payment.createdAt).toLocaleString("pt-BR")}
                  {payment.confirmedAt ? ` · pago ${new Date(payment.confirmedAt).toLocaleString("pt-BR")}` : ""}
                  {payment.session?.id ? ` · sessão ${payment.session.id.slice(-6)}` : ""}
                  {payment.refundedAmountCents ? ` · estorno ${formatCurrency(payment.refundedAmountCents)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="font-mono">{formatCurrency(payment.amountCents)}</p>
                {payment.status === "CONFIRMED" || payment.status === "COMPLETED" || payment.status === "AUTHORIZED" ? (
                  <Button size="sm" variant="outline" onClick={() => void refund(payment.id)}>
                    Estornar
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

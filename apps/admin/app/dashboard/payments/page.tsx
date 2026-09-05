"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listOpsPayments } from "@/lib/api-client";
import { formatCurrency } from "@/lib/labels";

export default function PaymentsPage() {
  const [status, setStatus] = useState("");
  const query = useQuery(() => listOpsPayments(), [status]);
  const items = (query.data ?? []).filter((item) => !status || item.status === status);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobranças da empresa. Ambiente DEMO quando o provider for mock. Sem dados de cartão.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["", "PENDING", "CONFIRMED", "COMPLETED", "FAILED", "EXPIRED"].map((item) => (
          <button
            key={item || "all"}
            className={`rounded-full border px-3 py-1 text-sm ${status === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            onClick={() => setStatus(item)}
            type="button"
          >
            {item || "Todos"}
          </button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimos pagamentos</CardTitle>
          <CardDescription>Isolados por empresa. Motoristas não aparecem entre tenants.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pagamento neste filtro.</p> : null}
          {items.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {payment.session?.connector.charger.station.name ?? "Carteira"} ·{" "}
                  {payment.session?.user.profile?.fullName ?? "Motorista"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payment.method} · {payment.status ?? "—"} · {new Date(payment.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <p className="font-mono">{formatCurrency(payment.amountCents)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

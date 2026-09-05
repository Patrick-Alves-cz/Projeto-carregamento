"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listFinanceReconciliation } from "@/lib/api-client";
import { formatCurrency } from "@/lib/labels";

export default function FinanceReconciliationPage() {
  const query = useQuery(() => listFinanceReconciliation(), []);
  const items = query.data ?? [];
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reconciliação financeira</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Divergências entre gateway e sistema interno. Isolado por empresa.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Casos abertos</CardTitle>
          <CardDescription>Webhooks pendentes, valores divergentes, sessões sem cobrança final e estornos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.error ? <QueryError message={query.error} /> : null}
          {items.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma divergência no momento.</p> : null}
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{item.reason}</p>
                <Badge>{item.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {new Date(item.detectedAt).toLocaleString("pt-BR")}
                {item.payment
                  ? ` · pagamento ${item.payment.provider} ${formatCurrency(item.payment.amountCents)} (${item.payment.status})`
                  : ""}
                {item.session
                  ? ` · sessão ${item.session.status} / ${item.session.billingStatus} ${formatCurrency(item.session.costCents)}`
                  : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

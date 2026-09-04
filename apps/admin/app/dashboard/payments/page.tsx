"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listOpsPayments } from "@/lib/api-client";
import { formatCurrency } from "@/lib/labels";

export default function PaymentsPage() {
  const query = useQuery(listOpsPayments, []);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transações demo</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pagamentos WALLET_DEMO das sessões da sua empresa.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Últimos pagamentos</CardTitle>
          <CardDescription>Somente sessões da empresa. Carteiras de motoristas permanecem isoladas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data ?? []).map((payment) => (
            <div key={payment.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {payment.session?.connector.charger.station.name ?? "Sessão"} ·{" "}
                  {payment.session?.user.profile?.fullName ?? "Motorista"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {payment.method} · {new Date(payment.createdAt).toLocaleString("pt-BR")}
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

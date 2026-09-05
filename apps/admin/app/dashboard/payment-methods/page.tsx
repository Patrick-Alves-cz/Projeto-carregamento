"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listAdminPaymentMethods } from "@/lib/api-client";

export default function PaymentMethodsPage() {
  const query = useQuery(listAdminPaymentMethods, []);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Métodos de pagamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apenas tokens, bandeira e final. Número completo e CVV nunca são armazenados.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cartões tokenizados</CardTitle>
          <CardDescription>Provider DEMO mock. Sem dados sensíveis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data ?? []).map((method) => (
            <div key={method.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {method.brand.toUpperCase()} •••• {method.last4}
                  {method.isDefault ? " · padrão" : ""}
                </p>
                <p className="text-sm text-muted-foreground">
                  {method.user.profile?.fullName ?? method.user.email} · {method.provider} · {method.expMonth}/{method.expYear}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

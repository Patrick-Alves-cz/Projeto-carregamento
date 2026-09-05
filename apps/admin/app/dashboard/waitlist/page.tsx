"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { listAdminWaitlist } from "@/lib/api-client";

export default function WaitlistPage() {
  const query = useQuery(listAdminWaitlist, []);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fila de espera</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quem aguarda um conector. A chamada usa eventos internos, sem polling agressivo.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fila atual</CardTitle>
          <CardDescription>Ordenada por conector e posição.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém na fila agora.</p>
          ) : null}
          {(query.data ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {item.station.name} · posição {item.position}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.user.profile?.fullName ?? item.user.email} · {item.status}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

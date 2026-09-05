"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { cancelAdminReservation, listAdminReservations } from "@/lib/api-client";
import { useState } from "react";

export default function ReservationsPage() {
  const [tick, setTick] = useState(0);
  const query = useQuery(listAdminReservations, [tick]);
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reservas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Reservas da empresa. Cancelar devolve o conector se estiver RESERVED.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Agenda</CardTitle>
          <CardDescription>Isolamento por companyId.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {query.error ? <QueryError message={query.error} /> : null}
          {(query.data ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">
                  {item.station.name} · {item.status}
                </p>
                <p className="text-sm text-muted-foreground">
                  {item.user.profile?.fullName ?? item.user.email} · {new Date(item.startAt).toLocaleString("pt-BR")}
                </p>
              </div>
              {["PENDING", "CONFIRMED", "ACTIVE"].includes(item.status) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void cancelAdminReservation(item.id).then(() => setTick((value) => value + 1))
                  }
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

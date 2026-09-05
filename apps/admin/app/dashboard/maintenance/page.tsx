"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { cancelMaintenance, createMaintenance, listChargers, listMaintenance } from "@/lib/api-client";

export default function MaintenancePage() {
  const [tick, setTick] = useState(0);
  const [reason, setReason] = useState("Manutenção preventiva");
  const [chargerId, setChargerId] = useState("");
  const { data, error, loading } = useQuery(listMaintenance, [tick]);
  const chargers = useQuery(listChargers, []);

  async function create() {
    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await createMaintenance({ chargerId: chargerId || chargers.data?.[0]?.id, startsAt, endsAt, reason });
    setTick((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Manutenção</h1>
        <p className="text-sm text-muted-foreground">Janelas que bloqueiam novas sessões e reservas.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Agendar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Carregador</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={chargerId}
              onChange={(event) => setChargerId(event.target.value)}
            >
              <option value="">Selecionar</option>
              {(chargers.data ?? []).map((charger) => (
                <option key={charger.id} value={charger.id}>
                  {charger.identity ?? charger.serialNumber}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void create()}>Iniciar 1h agora</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Janelas</CardTitle>
          <CardDescription>{data?.length ?? 0} registro(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {error ? <QueryError message={error} /> : null}
          {(data ?? []).map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{item.reason}</p>
                <p className="text-sm text-muted-foreground">
                  {item.charger?.identity ?? item.station?.name ?? "Recurso"} · {new Date(item.startsAt).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{item.status}</Badge>
                {item.status === "ACTIVE" || item.status === "SCHEDULED" ? (
                  <Button size="sm" variant="outline" onClick={() => void cancelMaintenance(item.id).then(() => setTick((v) => v + 1))}>
                    Cancelar
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

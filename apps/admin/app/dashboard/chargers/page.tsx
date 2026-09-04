"use client";

import Link from "next/link";
import { useState } from "react";
import { PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { listChargers, type Charger } from "@/lib/api-client";
import { chargerStatusLabel } from "@/lib/labels";

function lastSeenLabel(value?: string | null) {
  if (!value) return "Sem comunicação";
  return new Date(value).toLocaleString("pt-BR");
}

export default function ChargersPage() {
  const [tick, setTick] = useState(0);
  const { data, error, loading } = useQuery(listChargers, [tick]);
  useRealtime(() => setTick((value) => value + 1));

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl">
        <QueryError message={error} />
      </div>
    );
  }

  const chargers = data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Carregadores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status operacional, conexão OCPP 1.6 e última comunicação.
        </p>
      </div>
      <div className="grid gap-4">
        {chargers.map((charger) => (
          <ChargerRow key={charger.id} charger={charger} />
        ))}
        {chargers.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Nenhum carregador</CardTitle>
              <CardDescription>Cadastre carregadores nas estações.</CardDescription>
            </CardHeader>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ChargerRow({ charger }: { charger: Charger }) {
  const ocpp = charger.providerId === "ocpp16" || charger.providerId === "ocpp";
  return (
    <Link href={`/dashboard/chargers/${charger.id}`}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlugZap className="size-4" />
              {charger.identity ?? charger.serialNumber}
            </CardTitle>
            <CardDescription>
              {charger.station?.name ?? charger.stationId} · {charger.vendor ?? charger.model ?? "—"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{ocpp ? "OCPP 1.6" : "Mock"}</Badge>
            {ocpp ? (
              <Badge variant={charger.ocppOnline ? "default" : "secondary"}>
                {charger.ocppOnline ? "ONLINE" : "OFFLINE"}
              </Badge>
            ) : null}
            <StatusBadge kind="charger" status={charger.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p>{chargerStatusLabel(charger.status)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última comunicação</p>
            <p>{lastSeenLabel(charger.lastSeenAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Conectores</p>
            <p>{charger.connectors.map((c) => `${c.number}:${c.status}`).join(" · ") || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Firmware</p>
            <p>{charger.firmwareVersion ?? "—"}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Cable, MapPin, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useQuery } from "@/hooks/use-query";
import { chargerDemoAction, getStation } from "@/lib/api-client";
import { amenityLabel } from "@/lib/labels";
import { StationOpsForms } from "@/components/station-ops-forms";

export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const { data: station, error, loading } = useQuery(() => getStation(params.id), [params.id, tick]);

  async function runAction(
    chargerId: string,
    action: "offline" | "maintenance" | "fault" | "restore",
  ) {
    setActionBusy(`${chargerId}-${action}`);
    try {
      await chargerDemoAction(chargerId, action);
      setTick((v) => v + 1);
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/stations">
            <ArrowLeft />
            Estações
          </Link>
        </Button>
        <QueryError message={error || "Estação não encontrada"} />
      </div>
    );
  }

  const free = station.availability.availableConnectors;
  const total = station.availability.totalConnectors;
  const pct = total > 0 ? Math.round((free / total) * 100) : 0;
  const maxPower = station.chargers.reduce((acc, charger) => Math.max(acc, charger.maxPowerKw), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/stations">
          <ArrowLeft />
          Estações
        </Link>
      </Button>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{station.name}</h1>
          <StatusBadge kind="station" status={station.status} />
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {station.address}
        </p>
        {station.amenities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {station.amenities.map((amenity) => (
              <Badge key={amenity} variant="secondary">
                {amenityLabel(amenity)}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="gap-3 py-4">
          <CardHeader className="px-5">
            <CardDescription className="flex items-center gap-2">
              <PlugZap className="size-3.5" />
              Carregadores
            </CardDescription>
            <CardTitle className="font-mono text-2xl">{station.chargers.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-5">
            <CardDescription className="flex items-center gap-2">
              <Cable className="size-3.5" />
              Conectores livres
            </CardDescription>
            <CardTitle className="font-mono text-2xl">
              {free}/{total}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="gap-3 py-4">
          <CardHeader className="px-5">
            <CardDescription>Potência máxima</CardDescription>
            <CardTitle className="font-mono text-2xl">{maxPower} kW</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {station.chargers.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-medium">Nenhum carregador nesta estação</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os carregadores cadastrados na API aparecem aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {station.chargers.map((charger) => (
            <Card key={charger.id} className="gap-4 py-5">
              <CardHeader className="px-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-mono text-base">{charger.serialNumber}</CardTitle>
                    <CardDescription>
                      {charger.model ?? "Modelo não informado"} · {charger.maxPowerKw} kW
                    </CardDescription>
                  </div>
                  <StatusBadge kind="charger" status={charger.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionBusy !== null}
                    onClick={() => runAction(charger.id, "offline")}
                  >
                    Offline
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionBusy !== null}
                    onClick={() => runAction(charger.id, "maintenance")}
                  >
                    Manutenção
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionBusy !== null}
                    onClick={() => runAction(charger.id, "fault")}
                  >
                    Simular falha
                  </Button>
                  <Button
                    size="sm"
                    disabled={actionBusy !== null}
                    onClick={() => runAction(charger.id, "restore")}
                  >
                    Restaurar
                  </Button>
                </div>
                <div className="space-y-2">
                  {charger.connectors.map((connector) => (
                    <div
                      key={connector.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          Conector {connector.number} · {connector.type}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">{connector.maxPowerKw} kW</p>
                      </div>
                      <StatusBadge kind="connector" status={connector.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <StationOpsForms station={station} onSaved={() => setTick((v) => v + 1)} />
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { listActiveSessions, type ChargingSession } from "@/lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  formatPower,
  sessionStatusLabel,
} from "@/lib/labels";

function LiveSessionRow({ session }: { session: ChargingSession }) {
  return (
    <div className="grid gap-3 rounded-lg border border-border/60 bg-card/50 p-4 md:grid-cols-6">
      <div className="md:col-span-2">
        <p className="font-medium">{session.station.name}</p>
        <p className="text-xs text-muted-foreground">
          {session.charger.serialNumber} · Conector {session.connector.number}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {session.userName} · {session.vehicle.brand} {session.vehicle.model}
        </p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Status</p>
        <Badge variant="outline">{sessionStatusLabel(session.status)}</Badge>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Potência</p>
        <p className="font-mono text-lg">{formatPower(session.currentPowerKw ?? 0)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Energia</p>
        <p className="font-mono text-lg">{formatEnergy(session.energyKwh)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Custo / Duração</p>
        <p className="font-mono text-lg">{formatCurrency(session.costCents)}</p>
        <p className="text-xs text-muted-foreground">{formatDuration(session.durationSeconds)}</p>
      </div>
    </div>
  );
}

export default function OperationsPage() {
  const [tick, setTick] = useState(0);
  const sessionsQuery = useQuery(listActiveSessions, [tick]);
  const refresh = useCallback(() => setTick((v) => v + 1), []);

  useRealtime(() => {
    refresh();
  });

  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operação ao vivo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sessões de recarga em andamento · atualização automática via WebSocket
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessões ativas</CardTitle>
          <CardDescription>
            {sessions.length === 0
              ? "Nenhuma recarga em andamento no momento"
              : `${sessions.length} sessão(ões) ativa(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionsQuery.loading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : sessionsQuery.error ? (
            <QueryError message={sessionsQuery.error} />
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Quando um motorista iniciar uma recarga, ela aparecerá aqui em tempo real.
            </p>
          ) : (
            sessions.map((session) => <LiveSessionRow key={session.id} session={session} />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}

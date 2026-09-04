"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { listActiveSessions, pauseSession, resumeSession, stopSession, type ChargingSession } from "@/lib/api-client";
import {
  formatCurrency,
  formatDuration,
  formatEnergy,
  formatPower,
  sessionStatusLabel,
} from "@/lib/labels";

function LiveSessionRow({
  session,
  onChanged,
}: {
  session: ChargingSession;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border/60 bg-card/50 p-4 md:grid-cols-7">
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
        <p className="font-mono text-lg">{formatPower(session.status === "PAUSED" ? 0 : session.currentPowerKw ?? 0)}</p>
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
      <div className="flex flex-col gap-2">
        {session.status === "ACTIVE" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => pauseSession(session.id))}>
            Pausar
          </Button>
        ) : null}
        {session.status === "PAUSED" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => resumeSession(session.id))}>
            Retomar
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="destructive"
          disabled={busy}
          onClick={() => {
            if (confirm("Encerrar esta sessão?")) void run(() => stopSession(session.id));
          }}
        >
          Encerrar
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/dashboard/operations/${session.id}`}>Detalhe</Link>
        </Button>
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
          Pause, retome ou encerre pela API. Sem manipulação direta do banco.
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
            sessions.map((session) => (
              <LiveSessionRow key={session.id} session={session} onChanged={refresh} />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

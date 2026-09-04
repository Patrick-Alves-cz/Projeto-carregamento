"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { getSession, pauseSession, resumeSession, stopSession } from "@/lib/api-client";
import { formatCurrency, formatDuration, formatEnergy, formatPower, sessionStatusLabel } from "@/lib/labels";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const query = useQuery(() => getSession(params.id), [params.id, tick]);
  const session = query.data;

  async function run(fn: () => Promise<unknown>) {
    await fn();
    setTick((value) => value + 1);
  }

  if (query.error || (!query.loading && !session)) {
    return <QueryError message={query.error || "Sessão não encontrada"} />;
  }
  if (!session) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/operations">Voltar</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>
            {session.station.name} · {sessionStatusLabel(session.status)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Cliente: {session.userName}</p>
          <p>Veículo: {session.vehicle.brand} {session.vehicle.model}</p>
          <p>Carregador: {session.charger.serialNumber}</p>
          <p>Conector: {session.connector.number} · {session.connector.type}</p>
          <p>Início: {session.startedAt ? new Date(session.startedAt).toLocaleString("pt-BR") : "—"}</p>
          <p>Tempo: {formatDuration(session.durationSeconds)}</p>
          <p>Energia: {formatEnergy(session.energyKwh)}</p>
          <p>Potência: {formatPower(session.status === "PAUSED" ? 0 : session.currentPowerKw ?? 0)}</p>
          <p>Custo: {formatCurrency(session.costCents)}</p>
          <div className="flex gap-2 pt-3">
            {session.status === "ACTIVE" ? (
              <Button onClick={() => void run(() => pauseSession(session.id))}>Pausar</Button>
            ) : null}
            {session.status === "PAUSED" ? (
              <Button onClick={() => void run(() => resumeSession(session.id))}>Retomar</Button>
            ) : null}
            {session.status === "ACTIVE" || session.status === "PAUSED" ? (
              <Button
                variant="destructive"
                onClick={() => {
                  if (confirm("Encerrar esta sessão?")) void run(() => stopSession(session.id));
                }}
              >
                Encerrar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

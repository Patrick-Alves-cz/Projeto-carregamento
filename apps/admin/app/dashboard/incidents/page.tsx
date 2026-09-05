"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-state";
import { useQuery } from "@/hooks/use-query";
import { acknowledgeIncident, listIncidents, resolveIncident } from "@/lib/api-client";

export default function IncidentsPage() {
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [tick, setTick] = useState(0);
  const query = useMemo(() => () => listIncidents({ status: status || undefined, severity: severity || undefined }), [status, severity]);
  const { data, error, loading } = useQuery(query, [status, severity, tick]);

  async function ack(id: string) {
    await acknowledgeIncident(id);
    setTick((value) => value + 1);
  }
  async function resolve(id: string) {
    const resolution = window.prompt("Resolução") ?? "";
    if (!resolution.trim()) return;
    await resolveIncident(id, resolution);
    setTick((value) => value + 1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Incidentes</h1>
        <p className="text-sm text-muted-foreground">Filtre, reconheça e resolva falhas operacionais.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {["", "OPEN", "ACKNOWLEDGED", "RESOLVED"].map((value) => (
          <Button key={value || "all"} size="sm" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>
            {value || "Todos"}
          </Button>
        ))}
        {["", "INFO", "WARNING", "HIGH", "CRITICAL"].map((value) => (
          <Button key={`s-${value || "all"}`} size="sm" variant={severity === value ? "default" : "outline"} onClick={() => setSeverity(value)}>
            {value || "Severidade"}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>{data?.length ?? 0} incidente(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Carregando…</p> : null}
          {error ? <QueryError message={error} /> : null}
          {(data ?? []).map((incident) => (
            <div key={incident.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="font-medium">{incident.title}</p>
                <p className="text-sm text-muted-foreground">
                  {incident.station.name} {incident.charger?.identity ? `· ${incident.charger.identity}` : ""}
                </p>
                <p className="mt-1 text-sm">{incident.description}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <Badge variant="outline">{incident.severity}</Badge>
                  <Badge>{incident.status}</Badge>
                </div>
                {incident.status === "OPEN" ? (
                  <Button size="sm" variant="outline" onClick={() => void ack(incident.id)}>
                    Reconhecer
                  </Button>
                ) : null}
                {incident.status !== "RESOLVED" && incident.status !== "IGNORED" ? (
                  <Button size="sm" onClick={() => void resolve(incident.id)}>
                    Resolver
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

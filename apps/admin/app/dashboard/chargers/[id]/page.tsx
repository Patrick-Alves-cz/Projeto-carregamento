"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { getChargerOcpp, rotateOcppCredential, sendOcppCommand } from "@/lib/api-client";
import { chargerStatusLabel, connectorStatusLabel, formatCurrency, formatEnergy } from "@/lib/labels";

export default function ChargerDetailPage() {
  const params = useParams<{ id: string }>();
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [idTag, setIdTag] = useState("ADMINSTART01");
  const [error, setError] = useState("");
  const [credential, setCredential] = useState<{ ocppUrl: string; secret: string; identity: string } | null>(null);
  const { data, error: loadError, loading } = useQuery(() => getChargerOcpp(params.id), [params.id, tick]);
  useRealtime(() => setTick((value) => value + 1));

  async function run(
    label: string,
    body: Parameters<typeof sendOcppCommand>[1],
    dangerous = false,
  ) {
    if (dangerous && !window.confirm(`Confirmar comando ${label}? Esta ação afeta o carregador físico.`)) {
      return;
    }
    setBusy(label);
    setError("");
    try {
      const result = await sendOcppCommand(params.id, body);
      if (!result.accepted) setError(`${label} rejeitado pelo carregador`);
      setTick((value) => value + 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Falha em ${label}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard/chargers">
            <ArrowLeft />
            Carregadores
          </Link>
        </Button>
        <QueryError message={loadError || "Carregador não encontrado"} />
      </div>
    );
  }

  const connector1 = data.connectors[0]?.number ?? 1;
  const session = data.currentTransaction?.session;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/dashboard/chargers">
          <ArrowLeft />
          Carregadores
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{data.identity ?? data.serialNumber}</h1>
        <Badge variant="outline">OCPP 1.6</Badge>
        <Badge variant={data.ocppOnline ? "default" : "secondary"}>
          {data.ocppOnline ? "ONLINE" : "OFFLINE"}
        </Badge>
        <Badge variant="outline">{data.healthStatus ?? "—"}</Badge>
        <Badge variant="outline">Confiabilidade {data.reliabilityScore ?? "—"}</Badge>
        <StatusBadge kind="charger" status={data.status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="gap-2 py-4">
          <CardHeader className="px-5">
            <CardDescription>Status</CardDescription>
            <CardTitle className="text-lg">{chargerStatusLabel(data.status)}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-5">
            <CardDescription>Última comunicação</CardDescription>
            <CardTitle className="text-lg">
              {data.lastSeenAt ? new Date(data.lastSeenAt).toLocaleString("pt-BR") : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-5">
            <CardDescription>Modelo / Fabricante</CardDescription>
            <CardTitle className="text-lg">{data.vendor ?? "—"} {data.model ?? ""}</CardTitle>
          </CardHeader>
        </Card>
        <Card className="gap-2 py-4">
          <CardHeader className="px-5">
            <CardDescription>Firmware / Serial</CardDescription>
            <CardTitle className="text-lg">{data.firmwareVersion ?? "—"}</CardTitle>
            <CardDescription>{data.serialNumber}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conectores</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {data.connectors.map((connector) => (
            <div key={connector.id} className="rounded-lg border p-3">
              <p className="font-medium">Connector {connector.number}</p>
              <p className="text-sm text-muted-foreground">
                {connector.type} · {connector.maxPowerKw} kW · {connectorStatusLabel(connector.status)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sessão atual</CardTitle>
        </CardHeader>
        <CardContent>
          {session ? (
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <p>Status: {session.status}</p>
              <p>Energia: {formatEnergy(Number(session.energyKwh))}</p>
              <p>Custo: {formatCurrency(session.costCents)}</p>
              <p>TX OCPP: {data.currentTransaction?.ocppTransactionId}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma transação OCPP ativa.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conexão OCPP (carregador físico)</CardTitle>
          <CardDescription>
            Identity e URL para o painel do equipamento. O secret só aparece uma vez após gerar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Identity: <span className="font-mono">{data.identity ?? data.serialNumber}</span>
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(busy)}
            onClick={async () => {
              if (
                !window.confirm(
                  "Gerar uma nova credencial OCPP? A senha anterior deixa de funcionar imediatamente.",
                )
              ) {
                return;
              }
              setBusy("credential");
              setError("");
              try {
                const result = await rotateOcppCredential(params.id);
                setCredential({
                  ocppUrl: result.ocppUrl,
                  secret: result.secret,
                  identity: result.identity,
                });
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Falha ao gerar credencial");
              } finally {
                setBusy(null);
              }
            }}
          >
            Gerar credencial OCPP
          </Button>
          {credential ? (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
              <p>URL: {credential.ocppUrl}</p>
              <p>Identity / usuário: {credential.identity}</p>
              <p>Password: {credential.secret}</p>
              <p className="font-sans text-muted-foreground">Guarde agora. Não será exibido novamente.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comandos operacionais</CardTitle>
          <CardDescription>Ações perigosas pedem confirmação e geram auditoria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>idTag (Remote Start)</Label>
              <Input value={idTag} maxLength={20} onChange={(e) => setIdTag(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={Boolean(busy)}
              onClick={() =>
                void run("Remote Start", {
                  action: "REMOTE_START",
                  connectorNumber: connector1,
                  idTag,
                  confirm: true,
                })
              }
            >
              Remote Start
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() =>
                void run("Remote Stop", { action: "REMOTE_STOP", connectorNumber: connector1, confirm: true }, true)
              }
            >
              Remote Stop
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() =>
                void run(
                  "Disponível",
                  {
                    action: "CHANGE_AVAILABILITY",
                    connectorNumber: connector1,
                    availability: "Operative",
                    confirm: true,
                  },
                  true,
                )
              }
            >
              Disponibilizar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() =>
                void run(
                  "Indisponível",
                  {
                    action: "CHANGE_AVAILABILITY",
                    connectorNumber: connector1,
                    availability: "Inoperative",
                    confirm: true,
                  },
                  true,
                )
              }
            >
              Indisponibilizar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={Boolean(busy)}
              onClick={() => void run("Reset", { action: "RESET", resetType: "Soft", confirm: true }, true)}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data.events ?? []).map((event) => (
            <div key={event.id} className="flex justify-between gap-4 rounded-md border px-3 py-2 text-sm">
              <span>{event.type}</span>
              <span className="text-muted-foreground">{new Date(event.createdAt).toLocaleString("pt-BR")}</span>
            </div>
          ))}
          {(data.events ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento OCPP ainda.</p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Comandos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data.commands ?? []).map((item) => (
              <p key={item.id}>
                {item.type} · {item.status}
              </p>
            ))}
            {(data.commands ?? []).length === 0 ? <p className="text-muted-foreground">Nenhum comando.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Incidentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data.incidents ?? []).map((item) => (
              <p key={item.id}>
                {item.title} · {item.status}
              </p>
            ))}
            {(data.incidents ?? []).length === 0 ? <p className="text-muted-foreground">Nenhum incidente.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Manutenção</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(data.maintenanceWindows ?? []).map((item) => (
              <p key={item.id}>
                {item.reason} · {item.status}
              </p>
            ))}
            {(data.maintenanceWindows ?? []).length === 0 ? <p className="text-muted-foreground">Sem janelas.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

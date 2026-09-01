"use client";

import Link from "next/link";
import { Cable, MapPin, PlugZap, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSkeleton, QueryError, TableSkeleton } from "@/components/query-state";
import { StationsTable } from "@/components/stations-table";
import { useQuery } from "@/hooks/use-query";
import { useAuth } from "@/components/app-shell";
import { listStations } from "@/lib/api-client";

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: typeof MapPin;
}) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <CardDescription>{label}</CardDescription>
          <span className="rounded-md bg-secondary p-1.5 text-muted-foreground">
            <Icon className="size-4" />
          </span>
        </div>
        <CardTitle className="font-mono text-3xl tracking-tight">{value}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuth();
  const stationsQuery = useQuery(listStations, []);

  const stations = stationsQuery.data ?? [];
  const chargers = stations.flatMap((s) => s.chargers);
  const online = chargers.filter((c) => c.status === "ONLINE").length;
  const free = stations.reduce((acc, s) => acc + s.availability.availableConnectors, 0);
  const totalConnectors = stations.reduce((acc, s) => acc + s.availability.totalConnectors, 0);
  const maintenance = stations.filter((s) => s.status === "MAINTENANCE").length;
  const company = user.companies[0]?.name;
  const name = user.profile?.fullName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ? `Olá, ${name}` : "Visão geral"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {company ? `Rede ${company} · operação em tempo real da infraestrutura.` : "Acompanhe estações e conectores da sua empresa."}
        </p>
      </div>

      {stationsQuery.loading ? (
        <KpiSkeleton />
      ) : stationsQuery.error ? (
        <QueryError message={stationsQuery.error} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Estações" value={stations.length} hint="No recorte da sua empresa" icon={MapPin} />
          <Kpi label="Carregadores online" value={`${online}/${chargers.length}`} hint="Disponíveis para operação" icon={PlugZap} />
          <Kpi label="Conectores livres" value={`${free}/${totalConnectors}`} hint="Prontos para iniciar recarga" icon={Cable} />
          <Kpi label="Em manutenção" value={maintenance} hint="Estações fora de operação normal" icon={Wrench} />
        </div>
      )}

      <Card className="gap-4 py-5">
        <CardHeader className="flex flex-row items-center justify-between px-5">
          <div>
            <CardTitle>Estações</CardTitle>
            <CardDescription>Disponibilidade de conectores por local</CardDescription>
          </div>
          <Link href="/dashboard/stations" className="text-sm text-primary hover:underline">
            Ver todas
          </Link>
        </CardHeader>
        <CardContent className="px-5">
          {stationsQuery.loading ? (
            <TableSkeleton />
          ) : stationsQuery.error ? null : (
            <StationsTable stations={stations} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

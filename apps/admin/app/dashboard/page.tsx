"use client";

import Link from "next/link";
import { Cable, MapPin, PlugZap, Wrench } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiSkeleton, QueryError, TableSkeleton } from "@/components/query-state";
import { StationsTable } from "@/components/stations-table";
import { useQuery } from "@/hooks/use-query";
import { useAuth } from "@/components/app-shell";
import { getOpsSummary, listStations } from "@/lib/api-client";
import { formatCurrency } from "@/lib/labels";

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
  const summaryQuery = useQuery(getOpsSummary, []);
  const stationsQuery = useQuery(listStations, []);
  const summary = summaryQuery.data;
  const company = user.companies[0]?.name;
  const name = user.profile?.fullName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {name ? `Olá, ${name}` : "Visão geral"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {company ? `Rede ${company} · totais da API operacional.` : "Acompanhe estações e conectores da sua empresa."}
        </p>
      </div>

      {summaryQuery.loading ? (
        <KpiSkeleton />
      ) : summaryQuery.error ? (
        <QueryError message={summaryQuery.error} />
      ) : summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Sessões ativas" value={summary.activeSessions} hint={`${summary.occupiedChargers} ocupados`} icon={Cable} />
          <Kpi label="Disponíveis" value={summary.availableChargers} hint={`${summary.chargers} carregadores`} icon={PlugZap} />
          <Kpi label="Offline / falha" value={summary.offlineChargers} hint="Inclui manutenção" icon={MapPin} />
          <Kpi
            label="Receita DEMO"
            value={formatCurrency(summary.demoRevenueCents)}
            hint={`${summary.energyKwh.toFixed(1)} kWh · ${summary.activeCustomers} clientes`}
            icon={Wrench}
          />
        </div>
      ) : null}

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
            <StationsTable stations={stationsQuery.data ?? []} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

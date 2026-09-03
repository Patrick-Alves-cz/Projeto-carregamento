"use client";

import { useRouter } from "next/navigation";
import { NetworkMap } from "@/components/network-map";
import { QueryError } from "@/components/query-state";
import { StatusBadge } from "@/components/status-badge";
import { useQuery } from "@/hooks/use-query";
import { useRealtime } from "@/hooks/use-realtime";
import { listStations } from "@/lib/api-client";

export default function NetworkMapPage() {
  const router = useRouter();
  const { data, error, loading } = useQuery(listStations, []);
  useRealtime();

  const stations = data ?? [];

  return (
    <div className="-m-4 flex min-h-[calc(100svh-4rem)] flex-col md:-m-6 lg:-m-8">
      <div className="border-b px-4 py-4 md:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Mapa da rede</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Distribuição operacional das estações da sua empresa.
        </p>
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-[420px]">
          {error ? (
            <div className="p-6">
              <QueryError message={error} />
            </div>
          ) : loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Carregando mapa…
            </div>
          ) : (
            <NetworkMap stations={stations} onSelect={(id) => router.push(`/dashboard/stations/${id}`)} />
          )}
        </div>
        <aside className="border-t lg:border-l lg:border-t-0">
          <div className="space-y-2 p-4">
            {stations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => router.push(`/dashboard/stations/${station.id}`)}
                className="w-full rounded-lg border px-3 py-3 text-left hover:bg-accent"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{station.name}</p>
                  <StatusBadge kind="station" status={station.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {station.chargers.length} carregadores · {station.availability.availableConnectors}/
                  {station.availability.totalConnectors} livres
                </p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

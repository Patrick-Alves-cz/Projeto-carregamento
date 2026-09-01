"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { StationsTable } from "@/components/stations-table";
import { useQuery } from "@/hooks/use-query";
import { listStations } from "@/lib/api-client";

const FILTERS = [
  { value: "ALL", label: "Todas" },
  { value: "ACTIVE", label: "Operando" },
  { value: "MAINTENANCE", label: "Manutenção" },
  { value: "INACTIVE", label: "Inativas" },
] as const;

export default function StationsPage() {
  const { data, error, loading } = useQuery(listStations, []);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("ALL");

  const stations = useMemo(() => {
    const list = data ?? [];
    if (filter === "ALL") return list;
    return list.filter((s) => s.status === filter);
  }, [data, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Infraestrutura da empresa, com status e disponibilidade de conectores.
          </p>
        </div>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
          <TabsList className="w-full justify-start sm:w-auto">
            {FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : error ? (
        <QueryError message={error} />
      ) : (
        <Card className="py-4">
          <CardContent className="px-4">
            <StationsTable stations={stations} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

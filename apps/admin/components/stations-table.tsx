"use client";

import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import type { Station } from "@/lib/api-client";

export function StationsTable({ stations }: { stations: Station[] }) {
  const router = useRouter();

  if (stations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="font-medium">Nenhuma estação nesta visão</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando houver estações na sua empresa, elas aparecem aqui.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Estação</TableHead>
          <TableHead className="hidden md:table-cell">Endereço</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Carregadores</TableHead>
          <TableHead>Conectores livres</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stations.map((station) => {
          const total = station.availability.totalConnectors;
          const free = station.availability.availableConnectors;
          const pct = total > 0 ? Math.round((free / total) * 100) : 0;
          const href = `/dashboard/stations/${station.id}`;
          return (
            <TableRow
              key={station.id}
              className="cursor-pointer"
              tabIndex={0}
              onClick={() => router.push(href)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(href);
                }
              }}
            >
              <TableCell>
                <span className="font-medium">{station.name}</span>
                <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{station.address}</p>
              </TableCell>
              <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                {station.address}
              </TableCell>
              <TableCell>
                <StatusBadge kind="station" status={station.status} />
              </TableCell>
              <TableCell className="hidden font-mono text-muted-foreground sm:table-cell">
                {station.chargers.length}
              </TableCell>
              <TableCell>
                <div className="min-w-28 space-y-1">
                  <p className="font-mono text-sm">
                    {free}/{total}
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

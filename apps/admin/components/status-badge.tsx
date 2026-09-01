import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  chargerStatusLabel,
  connectorStatusLabel,
  stationStatusLabel,
} from "@/lib/labels";

const TONE: Record<string, string> = {
  ACTIVE: "border-transparent bg-emerald-500/15 text-emerald-400",
  ONLINE: "border-transparent bg-emerald-500/15 text-emerald-400",
  AVAILABLE: "border-transparent bg-emerald-500/15 text-emerald-400",
  MAINTENANCE: "border-transparent bg-amber-500/15 text-amber-400",
  OCCUPIED: "border-transparent bg-amber-500/15 text-amber-400",
  INACTIVE: "border-transparent bg-zinc-500/20 text-zinc-400",
  OFFLINE: "border-transparent bg-zinc-500/20 text-zinc-400",
  UNAVAILABLE: "border-transparent bg-zinc-500/20 text-zinc-400",
  FAULTED: "border-transparent bg-red-500/15 text-red-400",
};

type Kind = "station" | "charger" | "connector";

const LABELS = {
  station: stationStatusLabel,
  charger: chargerStatusLabel,
  connector: connectorStatusLabel,
};

export function StatusBadge({ status, kind }: { status: string; kind: Kind }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE[status])}>
      {LABELS[kind](status)}
    </Badge>
  );
}

export const DEFAULT_MAP_CENTER = { lat: -23.5505, lng: -46.6333 };

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const OSM_RASTER_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export function pinColor(station: {
  status: string;
  availableConnectors: number;
  totalConnectors: number;
  availabilityState?: string;
}) {
  const state = station.availabilityState;
  if (state === "AVAILABLE") return "#5EEAD4";
  if (state === "BUSY") return "#FBBF24";
  if (state === "LIMITED") return "#FDE68A";
  if (state === "OFFLINE") return "#8B9A95";
  if (state === "FAULTED") return "#F87171";
  if (state === "MAINTENANCE") return "#94A3B8";
  if (station.status !== "ACTIVE") return "#8B9A95";
  if (station.totalConnectors > 0 && station.availableConnectors === 0) return "#FBBF24";
  return "#5EEAD4";
}

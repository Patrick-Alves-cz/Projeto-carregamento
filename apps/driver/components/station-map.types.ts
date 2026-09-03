export type MapStationPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  availableConnectors: number;
  totalConnectors: number;
  status: string;
};

export type StationMapProps = {
  stations: MapStationPin[];
  center: { lat: number; lng: number };
  selectedId: string | null;
  userLocation?: { lat: number; lng: number } | null;
  onSelect: (id: string) => void;
};

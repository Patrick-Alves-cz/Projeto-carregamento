"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Station } from "@/lib/api-client";

function colorFor(station: Station) {
  if (station.status !== "ACTIVE") return "#8B9A95";
  if (station.availability.availableConnectors === 0) return "#FBBF24";
  return "#2DD4BF";
}

export function NetworkMap({
  stations,
  onSelect,
}: {
  stations: Station[];
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [-46.63, -23.55],
      zoom: 4.2,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers: maplibregl.Marker[] = [];
    for (const station of stations) {
      const el = document.createElement("button");
      el.type = "button";
      el.title = `${station.name} · ${station.availability.availableConnectors}/${station.availability.totalConnectors}`;
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.border = "0";
      el.style.background = colorFor(station);
      el.style.cursor = "pointer";
      el.onclick = () => onSelectRef.current(station.id);
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([station.longitude, station.latitude]).addTo(map));
    }
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [stations]);

  return <div ref={ref} className="h-full min-h-[480px] w-full overflow-hidden rounded-xl" />;
}

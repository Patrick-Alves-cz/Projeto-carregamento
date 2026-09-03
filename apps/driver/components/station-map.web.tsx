import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLE_URL, pinColor } from "../lib/map-style";
import type { StationMapProps } from "./station-map.types";

export function StationMap({
  stations,
  center,
  selectedId,
  userLocation,
  onSelect,
}: StationMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: [center.lng, center.lat],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Center updates are handled by a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], duration: 600 });
  }, [center.lat, center.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    for (const station of stations) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", station.name);
      el.style.width = selectedId === station.id ? "22px" : "16px";
      el.style.height = selectedId === station.id ? "22px" : "16px";
      el.style.borderRadius = "50%";
      el.style.border = selectedId === station.id ? "3px solid #F3F7F5" : "2px solid #042F2E";
      el.style.background = pinColor(station);
      el.style.cursor = "pointer";
      el.style.padding = "0";
      el.onclick = () => onSelectRef.current(station.id);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([station.longitude, station.latitude])
        .addTo(map);
      markersRef.current.push(marker);
    }

    if (userLocation) {
      const el = document.createElement("div");
      el.style.width = "14px";
      el.style.height = "14px";
      el.style.borderRadius = "50%";
      el.style.background = "#38BDF8";
      el.style.border = "3px solid #F3F7F5";
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [stations, selectedId, userLocation]);

  return (
    <View style={styles.wrap}>
      <div ref={containerRef} style={{ height: "100%", width: "100%" }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
});

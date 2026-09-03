import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { OSM_RASTER_TILES, pinColor } from "../lib/map-style";
import type { StationMapProps } from "./station-map.types";

export function StationMap({
  stations,
  center,
  selectedId,
  userLocation,
  onSelect,
}: StationMapProps) {
  const html = useMemo(() => {
    const payload = JSON.stringify({
      stations: stations.map((s) => ({
        ...s,
        color: pinColor(s),
      })),
      center,
      selectedId,
      userLocation,
    });
    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { height: 100%; margin: 0; background: #141C1B; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  const data = ${payload};
  const map = L.map('map', { zoomControl: false }).setView([data.center.lat, data.center.lng], 12);
  L.tileLayer('${OSM_RASTER_TILES}', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  for (const station of data.stations) {
    const size = station.id === data.selectedId ? 22 : 16;
    const icon = L.divIcon({
      className: '',
      iconSize: [size, size],
      html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:' + station.color + ';border:2px solid #F3F7F5"></div>'
    });
    L.marker([station.latitude, station.longitude], { icon }).addTo(map).on('click', function () {
      window.ReactNativeWebView.postMessage(JSON.stringify({ id: station.id }));
    });
  }
  if (data.userLocation) {
    L.circleMarker([data.userLocation.lat, data.userLocation.lng], {
      radius: 7, color: '#F3F7F5', weight: 2, fillColor: '#38BDF8', fillOpacity: 1
    }).addTo(map);
  }
</script>
</body>
</html>`;
  }, [stations, center, selectedId, userLocation]);

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.web}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data) as { id?: string };
            if (data.id) onSelect(data.id);
          } catch {
            /* ignore */
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  web: { backgroundColor: "#141C1B", flex: 1 },
});

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { CONNECTOR_TYPES } from "@evcharge/shared";
import { NearbyStationCard } from "../../../components/nearby-station-card";
import { StationMap } from "../../../components/station-map";
import {
  listFavorites,
  listNearbyStations,
  listVehicles,
  type NearbyQuery,
  type NearbyStation,
  type Vehicle,
} from "../../../lib/api-client";
import { connectorTypeLabel } from "../../../lib/labels";
import { DEFAULT_MAP_CENTER } from "../../../lib/map-style";
import { useRealtime } from "../../../lib/use-realtime";
import { colors, radius } from "../../../lib/theme";

type Filters = {
  compatible: boolean;
  availableNow: boolean;
  favoritesOnly: boolean;
  radiusKm: number;
  powerMin?: number;
  currentType?: "AC" | "DC";
  connectorType?: string;
  maxPrice?: number;
};

const INITIAL_FILTERS: Filters = {
  compatible: true,
  availableNow: false,
  favoritesOnly: false,
  radiusKm: 25,
};

export default function MapScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const [center, setCenter] = useState(DEFAULT_MAP_CENTER);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [stations, setStations] = useState<NearbyStation[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | undefined>();
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const defaultVehicle = vehicles.find((item) => item.isDefault) ?? vehicles[0];
  const selectedVehicleId = vehicleId ?? defaultVehicle?.id;

  const load = useCallback(async () => {
    const params: NearbyQuery = {
      lat: center.lat,
      lng: center.lng,
      radiusKm: filters.radiusKm,
      q: query.trim() || undefined,
      availability: filters.availableNow || undefined,
      powerMin: filters.powerMin,
      currentType: filters.currentType,
      connectorType: filters.connectorType,
      maxPrice: filters.maxPrice,
      vehicleId: filters.compatible ? selectedVehicleId : undefined,
    };
    const [data, favs] = await Promise.all([
      listNearbyStations(params),
      filters.favoritesOnly ? listFavorites().catch(() => []) : Promise.resolve([]),
    ]);
    const favoriteIds = new Set(favs.map((item) => item.stationId));
    setStations(filters.favoritesOnly ? data.filter((item) => favoriteIds.has(item.id)) : data);
    setError("");
    setSelectedId((current) => (current && data.some((item) => item.id === current) ? current : null));
  }, [center, filters, query, selectedVehicleId]);

  useEffect(() => {
    listVehicles()
      .then((items) => {
        setVehicles(items);
        const fallback = items.find((item) => item.isDefault) ?? items[0];
        if (fallback) setVehicleId(fallback.id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await Location.getForegroundPermissionsAsync();
        let status = current.status;
        if (status === "undetermined") {
          const requested = await Location.requestForegroundPermissionsAsync();
          status = requested.status;
        }
        if (status !== "granted") {
          setLocationDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(next);
        setCenter(next);
      } catch {
        setLocationDenied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Não foi possível carregar o mapa");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useRealtime(() => {
    void load();
  });

  const selected = useMemo(
    () => stations.find((item) => item.id === selectedId) ?? null,
    [stations, selectedId],
  );

  const list = (
    <ScrollView contentContainerStyle={styles.listContent} style={styles.list}>
      {locationDenied ? (
        <Text style={styles.hint}>Localização desativada. Busque uma cidade ou endereço.</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.hint}>Buscando estações…</Text>
        </View>
      ) : null}
      {!loading && stations.length === 0 ? (
        <Text style={styles.empty}>Nenhuma estação com esses filtros.</Text>
      ) : null}
      {stations.map((station) => (
        <NearbyStationCard
          key={station.id}
          selected={station.id === selectedId}
          station={station}
          onPress={() => {
            setSelectedId(station.id);
            if (!desktop) router.push(`/station/${station.id}`);
          }}
        />
      ))}
    </ScrollView>
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.body, desktop && styles.bodyDesktop]}>
        <View style={styles.mapPane}>
          <StationMap
            center={center}
            selectedId={selectedId}
            stations={stations}
            userLocation={userLocation}
            onSelect={(id) => {
              setSelectedId(id);
              if (!desktop) router.push(`/station/${id}`);
            }}
          />
          <View style={styles.searchBar}>
            <TextInput
              onChangeText={setQuery}
              onSubmitEditing={() => void load()}
              placeholder="Buscar nome, endereço, cidade ou CEP"
              placeholderTextColor={colors.muted}
              style={styles.search}
              value={query}
            />
            <Pressable onPress={() => setFiltersOpen(true)} style={styles.iconBtn}>
              <Ionicons color={colors.text} name="options" size={20} />
            </Pressable>
          </View>
        </View>
        {desktop ? (
          <View style={styles.side}>
            {selected ? (
              <Pressable onPress={() => router.push(`/station/${selected.id}`)} style={styles.openBtn}>
                <Text style={styles.openBtnText}>Abrir {selected.name}</Text>
              </Pressable>
            ) : null}
            {list}
          </View>
        ) : (
          <View style={styles.sheet}>{list}</View>
        )}
      </View>

      <Modal animationType="slide" transparent visible={filtersOpen} onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalCard}>
            <Text style={styles.modalTitle}>Filtros</Text>
            <FilterToggle
              label="Compatível com meu veículo"
              value={filters.compatible}
              onChange={(compatible) => setFilters((current) => ({ ...current, compatible }))}
            />
            <FilterToggle
              label="Disponível agora"
              value={filters.availableNow}
              onChange={(availableNow) => setFilters((current) => ({ ...current, availableNow }))}
            />
            <FilterToggle
              label="Somente favoritas"
              value={filters.favoritesOnly}
              onChange={(favoritesOnly) => setFilters((current) => ({ ...current, favoritesOnly }))}
            />
            <Text style={styles.filterLabel}>Distância</Text>
            <View style={styles.chips}>
              {[5, 10, 25, 50].map((km) => (
                <Chip
                  key={km}
                  active={filters.radiusKm === km}
                  label={`${km} km`}
                  onPress={() => setFilters((current) => ({ ...current, radiusKm: km }))}
                />
              ))}
            </View>
            <Text style={styles.filterLabel}>Potência mínima</Text>
            <View style={styles.chips}>
              {[undefined, 22, 50, 100, 150].map((value) => (
                <Chip
                  key={String(value)}
                  active={filters.powerMin === value}
                  label={value ? `${value} kW` : "Qualquer"}
                  onPress={() => setFilters((current) => ({ ...current, powerMin: value }))}
                />
              ))}
            </View>
            <Text style={styles.filterLabel}>Tipo</Text>
            <View style={styles.chips}>
              <Chip
                active={!filters.currentType}
                label="Todos"
                onPress={() => setFilters((current) => ({ ...current, currentType: undefined }))}
              />
              <Chip
                active={filters.currentType === "AC"}
                label="AC"
                onPress={() => setFilters((current) => ({ ...current, currentType: "AC" }))}
              />
              <Chip
                active={filters.currentType === "DC"}
                label="DC"
                onPress={() => setFilters((current) => ({ ...current, currentType: "DC" }))}
              />
            </View>
            <Text style={styles.filterLabel}>Conector</Text>
            <View style={styles.chips}>
              <Chip
                active={!filters.connectorType}
                label="Todos"
                onPress={() => setFilters((current) => ({ ...current, connectorType: undefined }))}
              />
              {CONNECTOR_TYPES.filter((type) => type !== "OTHER").map((type) => (
                <Chip
                  key={type}
                  active={filters.connectorType === type}
                  label={connectorTypeLabel(type)}
                  onPress={() => setFilters((current) => ({ ...current, connectorType: type }))}
                />
              ))}
            </View>
            <Text style={styles.filterLabel}>Preço máximo / kWh</Text>
            <View style={styles.chips}>
              {[undefined, 1.5, 1.89, 2.2].map((value) => (
                <Chip
                  key={String(value)}
                  active={filters.maxPrice === value}
                  label={value ? `R$ ${value.toFixed(2).replace(".", ",")}` : "Qualquer"}
                  onPress={() => setFilters((current) => ({ ...current, maxPrice: value }))}
                />
              ))}
            </View>
            {vehicles.length > 1 ? (
              <>
                <Text style={styles.filterLabel}>Veículo</Text>
                {vehicles.map((vehicle) => (
                  <Pressable
                    key={vehicle.id}
                    onPress={() => setVehicleId(vehicle.id)}
                    style={[styles.vehicleRow, vehicle.id === selectedVehicleId && styles.vehicleActive]}
                  >
                    <Text style={styles.vehicleName}>
                      {vehicle.brand} {vehicle.model}
                    </Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            <Pressable onPress={() => setFiltersOpen(false)} style={styles.apply}>
              <Text style={styles.applyText}>Aplicar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function FilterToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.switch, value && styles.switchOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bg, flex: 1 },
  body: { flex: 1 },
  bodyDesktop: { flexDirection: "row" },
  mapPane: { flex: 1, minHeight: 280 },
  searchBar: {
    flexDirection: "row",
    gap: 8,
    left: 16,
    position: "absolute",
    right: 16,
    top: 12,
  },
  search: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconBtn: {
    alignItems: "center",
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    width: 48,
  },
  side: { borderLeftColor: colors.border, borderLeftWidth: 1, width: 380 },
  sheet: {
    backgroundColor: colors.bg,
    borderTopColor: colors.border,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    height: "42%",
  },
  list: { flex: 1 },
  listContent: { gap: 10, padding: 16, paddingBottom: 32 },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  empty: { color: colors.muted, marginTop: 12, textAlign: "center" },
  loadingRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  openBtn: {
    backgroundColor: colors.primary,
    margin: 16,
    marginBottom: 0,
    borderRadius: radius.md,
    paddingVertical: 14,
  },
  openBtnText: { color: colors.primaryText, fontWeight: "700", textAlign: "center" },
  modalBackdrop: { backgroundColor: "rgba(0,0,0,0.55)", flex: 1, justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 8,
    padding: 20,
    paddingBottom: 36,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  filterLabel: { color: colors.muted, fontSize: 13, fontWeight: "600", marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.primaryText },
  toggle: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  switch: {
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    height: 24,
    justifyContent: "center",
    paddingHorizontal: 2,
    width: 44,
  },
  switchOn: { backgroundColor: colors.primary },
  knob: {
    backgroundColor: colors.text,
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  knobOn: { alignSelf: "flex-end" },
  vehicleRow: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 12,
  },
  vehicleActive: { borderColor: colors.primary },
  vehicleName: { color: colors.text, fontWeight: "600" },
  apply: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    marginTop: 16,
    paddingVertical: 14,
  },
  applyText: { color: colors.primaryText, fontSize: 16, fontWeight: "700", textAlign: "center" },
});

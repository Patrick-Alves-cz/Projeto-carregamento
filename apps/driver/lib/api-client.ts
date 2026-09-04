import { CONNECTOR_TYPE_LABELS, type ConnectorType } from "@evcharge/shared";
import { getItem, removeItem, setItem } from "./storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";
const AUTH_KEY = "evcharge_auth";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status?: string;
  profile: { fullName: string; phone: string | null; avatarUrl?: string | null } | null;
  companies: { id: string; name: string; slug: string }[];
}

export interface Connector {
  id: string;
  chargerId: string;
  number: number;
  type: string;
  maxPowerKw: number;
  status: string;
  compatible: boolean | null;
  pricePerKwhCents: number | null;
  pricePerMinuteCents?: number;
  idleFeeCents?: number;
  connectionFeeCents?: number;
  currency: string;
  action: "CHARGE" | "INCOMPATIBLE" | "OCCUPIED" | "UNAVAILABLE";
}

export interface Charger {
  id: string;
  stationId: string;
  serialNumber: string;
  model: string | null;
  maxPowerKw: number;
  status: string;
  lastSeenAt: string | null;
  connectors: Connector[];
}

export interface Reliability {
  lastCommunicationAt: string | null;
  lastUpdatedAt: string;
  availabilityPercent: number | null;
}

export interface Station {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  status: string;
  accessType: string;
  amenities: string[];
  openingHoursLabel: string | null;
  currentType: "AC" | "DC" | "MIXED" | null;
  maxPowerKw: number;
  pricePerKwhCents: number | null;
  currency: string;
  connectionFeeCents?: number;
  idleFeeCents?: number;
  compatible: boolean | null;
  crowded: boolean;
  lastSeenAt: string | null;
  updatedAt: string;
  reliability: Reliability;
  availability: {
    totalConnectors: number;
    availableConnectors: number;
    occupiedConnectors: number;
  };
  chargers: Charger[];
}

export interface NearbyStation {
  id: string;
  name: string;
  address: string;
  city: string | null;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  status: string;
  accessType: string;
  amenities: string[];
  openingHoursLabel: string | null;
  chargerCount: number;
  availableConnectors: number;
  totalConnectors: number;
  crowded: boolean;
  currentType: "AC" | "DC" | "MIXED" | null;
  maxPowerKw: number;
  pricePerKwhCents: number | null;
  currency: string;
  compatible: boolean | null;
  lastSeenAt: string | null;
  updatedAt: string;
  reliability: Reliability;
}

export interface NearbyQuery {
  lat: number;
  lng: number;
  radiusKm?: number;
  connectorType?: string;
  powerMin?: number;
  maxPrice?: number;
  availability?: boolean;
  vehicleId?: string;
  currentType?: "AC" | "DC";
  q?: string;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  batteryKwh: number | null;
  connectorTypes: string[];
  isDefault: boolean;
}

export interface VehicleInput {
  brand: string;
  model: string;
  year?: number;
  batteryKwh?: number;
  connectorTypes: ConnectorType[];
  isDefault?: boolean;
}

export async function getStoredTokens(): Promise<AuthTokens | null> {
  const raw = await getItem(AUTH_KEY);
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export async function storeTokens(tokens: AuthTokens) {
  await setItem(AUTH_KEY, JSON.stringify(tokens));
}

export async function clearTokens() {
  await removeItem(AUTH_KEY);
}

function readError(data: unknown, fallback: string, status?: number) {
  if (!data || typeof data !== "object") return new ApiError(fallback, undefined, status);
  const record = data as { message?: unknown; code?: unknown };
  const code = typeof record.code === "string" ? record.code : undefined;
  let message = fallback;
  if (typeof record.message === "string") message = record.message;
  else if (Array.isArray(record.message)) message = record.message.map(String).join(", ");
  return new ApiError(message, code, status);
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const tokens = await getStoredTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const data = (await res.json().catch(() => ({}))) as AuthTokens;
    if (!res.ok || !data.accessToken) return false;
    await storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const tokens = await getStoredTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  const isPublicAuth = [
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(path.split("?")[0] ?? path);

  if (res.status === 401 && retry && !isPublicAuth) {
    refreshInFlight ??= tryRefresh().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) return apiFetch<T>(path, options, false);
    await clearTokens();
    throw new ApiError("Sessão expirada. Entre novamente.", "UNAUTHORIZED", 401);
  }

  if (!res.ok) throw readError(data, "Falha na requisição", res.status);
  return data as T;
}

export async function login(email: string, password: string) {
  const data = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  await storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data;
}

export async function register(input: {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const data = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>(
    "/auth/register",
    { method: "POST", body: JSON.stringify({ ...input, role: "DRIVER" }) },
  );
  await storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data;
}

export async function logout() {
  const tokens = await getStoredTokens();
  if (tokens?.refreshToken) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => undefined);
  }
  await clearTokens();
}

export async function getMe() {
  return apiFetch<AuthUser>("/users/me");
}

export async function forgotPassword(email: string) {
  return apiFetch<{ message: string; resetToken?: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return apiFetch<{ success: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, password }),
  });
}

export async function updateMe(input: { fullName?: string; phone?: string }) {
  return apiFetch<AuthUser>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listNearbyStations(query: NearbyQuery) {
  const params = new URLSearchParams();
  params.set("lat", String(query.lat));
  params.set("lng", String(query.lng));
  if (query.radiusKm) params.set("radiusKm", String(query.radiusKm));
  if (query.connectorType) params.set("connectorType", query.connectorType);
  if (query.powerMin) params.set("powerMin", String(query.powerMin));
  if (query.maxPrice) params.set("maxPrice", String(query.maxPrice));
  if (query.availability) params.set("availability", "true");
  if (query.vehicleId) params.set("vehicleId", query.vehicleId);
  if (query.currentType) params.set("currentType", query.currentType);
  if (query.q) params.set("q", query.q);
  return apiFetch<NearbyStation[]>(`/stations/nearby?${params.toString()}`);
}

export async function getStation(id: string, vehicleId?: string) {
  const qs = vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : "";
  return apiFetch<Station>(`/stations/${id}${qs}`);
}

export async function listVehicles() {
  return apiFetch<Vehicle[]>("/vehicles");
}

export async function getVehicle(id: string) {
  return apiFetch<Vehicle>(`/vehicles/${id}`);
}

export async function createVehicle(input: VehicleInput) {
  return apiFetch<Vehicle>("/vehicles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateVehicle(id: string, input: Partial<VehicleInput>) {
  return apiFetch<Vehicle>(`/vehicles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteVehicle(id: string) {
  return apiFetch<{ success: boolean }>(`/vehicles/${id}`, { method: "DELETE" });
}

export interface ChargingSession {
  id: string;
  status: string;
  energyKwh: number;
  currentPowerKw: number | null;
  costCents: number;
  durationSeconds: number;
  startedAt: string | null;
  endedAt: string | null;
  stopReason: string | null;
  walletBalanceCents?: number;
  remainingCents?: number;
  lowBalance?: boolean;
  tariffSnapshot?: {
    name: string;
    pricePerKwhCents: number;
    pricePerMinuteCents?: number;
    idleFeeCents?: number;
    connectionFeeCents?: number;
    minBalanceCents?: number;
    currency: string;
  } | null;
  station: { id: string; name: string; address: string };
  charger: { id: string; serialNumber: string; maxPowerKw: number };
  connector: { id: string; number: number; type: string; maxPowerKw: number };
  vehicle: { brand: string; model: string };
  payment?: { amountCents: number; status: string; method?: string } | null;
  receipt?: { id: string; number: string; payload: ReceiptPayload } | null;
  meterValues?: Array<{ timestamp: string; energyKwh: number; powerKw: number }>;
}

export interface ReceiptPayload {
  brand: string;
  station: { name: string; address: string };
  charger: { serialNumber: string };
  connector: { number: number; type: string };
  vehicle: { brand: string; model: string };
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  energyKwh: number;
  tariff: { name: string; pricePerKwhCents: number; connectionFeeCents?: number; idleFeeCents?: number } | null;
  connectionFeeCents: number;
  idleFeeCents: number;
  totalCents: number;
  paymentMethod: string;
}

export interface Wallet {
  id: string;
  userId: string;
  balanceCents: number;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  type: string;
  kind: "DEPOSIT" | "CHARGE" | "REFUND" | "ADJUSTMENT";
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  createdAt: string;
}

export interface InAppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface SessionsListResponse {
  items: ChargingSession[];
  total: number;
  page: number;
  limit: number;
}

export async function startSession(connectorId: string, vehicleId: string) {
  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `start-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return apiFetch<ChargingSession>("/sessions/start", {
    method: "POST",
    body: JSON.stringify({ connectorId, vehicleId, idempotencyKey }),
  });
}

export async function stopSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/stop`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: `stop-${sessionId}` }),
  });
}

export async function pauseSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/pause`, { method: "POST" });
}

export async function resumeSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/resume`, { method: "POST" });
}

export async function getReceipt(sessionId: string) {
  return apiFetch<{ id: string; number: string; payload: ReceiptPayload }>(
    `/sessions/${sessionId}/receipt`,
  );
}

export async function getWallet() {
  return apiFetch<Wallet>("/wallet");
}

export async function listWalletTransactions() {
  return apiFetch<{ items: WalletTransaction[]; total: number; balanceCents: number }>(
    "/wallet/transactions?limit=50",
  );
}

export async function topUpWallet(amountCents: number) {
  const idempotencyKey =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `topup-${Date.now()}`;
  return apiFetch<{ wallet: Wallet; payment: { id: string }; replayed: boolean }>("/wallet/top-up", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ amountCents, idempotencyKey }),
  });
}

export async function listNotifications() {
  return apiFetch<InAppNotification[]>("/notifications");
}

export async function markNotificationRead(id: string) {
  return apiFetch<InAppNotification>(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function getSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}`);
}

export async function listSessions(params?: { status?: string; page?: number; limit?: number }) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<SessionsListResponse>(`/sessions${qs ? `?${qs}` : ""}`);
}

const WS_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(
  /\/api$/,
  "",
);

export function getRealtimeUrl() {
  return `${WS_URL}/realtime`;
}

export function connectorLabel(type: string) {
  return CONNECTOR_TYPE_LABELS[type as ConnectorType] ?? type;
}

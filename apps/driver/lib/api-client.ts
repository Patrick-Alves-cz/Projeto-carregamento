import { getItem, removeItem, setItem } from "./storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001/api";
const AUTH_KEY = "evcharge_auth";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  profile: { fullName: string } | null;
  companies: { id: string; name: string; slug: string }[];
}

export interface Connector {
  id: string;
  chargerId: string;
  number: number;
  type: string;
  maxPowerKw: number;
  status: string;
}

export interface Charger {
  id: string;
  stationId: string;
  serialNumber: string;
  model: string | null;
  maxPowerKw: number;
  status: string;
  connectors: Connector[];
}

export interface Station {
  id: string;
  companyId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  status: string;
  amenities: string[];
  availability: {
    totalConnectors: number;
    availableConnectors: number;
    occupiedConnectors: number;
  };
  chargers: Charger[];
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  batteryKwh: number | string | null;
  connectorTypes: string[];
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

function readErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || !("message" in data)) return fallback;
  const message = (data as { message: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return fallback;
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
  const isPublicAuth = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].includes(
    path,
  );

  if (res.status === 401 && retry && !isPublicAuth) {
    refreshInFlight ??= tryRefresh().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (refreshed) return apiFetch<T>(path, options, false);
    await clearTokens();
    throw new Error("Sessão expirada");
  }

  if (!res.ok) throw new Error(readErrorMessage(data, "Falha na requisição"));
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
  return apiFetch<AuthUser>("/auth/me");
}

export async function listStations() {
  return apiFetch<Station[]>("/stations");
}

export async function getStation(id: string) {
  return apiFetch<Station>(`/stations/${id}`);
}

export async function listVehicles() {
  return apiFetch<Vehicle[]>("/vehicles");
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
  station: { id: string; name: string; address: string };
  charger: { id: string; serialNumber: string; maxPowerKw: number };
  connector: { id: string; number: number; type: string; maxPowerKw: number };
  vehicle: { brand: string; model: string };
  payment?: { amountCents: number; status: string } | null;
}

export interface SessionsListResponse {
  items: ChargingSession[];
  total: number;
  page: number;
  limit: number;
}

export async function startSession(connectorId: string, vehicleId: string) {
  return apiFetch<ChargingSession>("/sessions/start", {
    method: "POST",
    body: JSON.stringify({ connectorId, vehicleId }),
  });
}

export async function stopSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/stop`, { method: "POST" });
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

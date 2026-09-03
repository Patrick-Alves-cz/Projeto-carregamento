import { isAdminPanelRole } from "@evcharge/shared";

const API_URL = "/api/proxy";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  status?: string;
  profile: { fullName: string } | null;
  companies: { id: string; name: string; slug: string; memberRole: string }[];
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
  providerId: string | null;
  connectors: Connector[];
}

export interface Station {
  id: string;
  companyId: string;
  name: string;
  address: string;
  city?: string | null;
  postalCode?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  accessType?: string;
  amenities: string[];
  openingHours?: Record<string, unknown> | null;
  openingHoursLabel?: string | null;
  currentType?: string | null;
  maxPowerKw?: number;
  pricePerKwhCents?: number | null;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
  availability: {
    totalConnectors: number;
    availableConnectors: number;
    occupiedConnectors: number;
  };
  chargers: Charger[];
}

export interface StationInput {
  name: string;
  address: string;
  city?: string;
  postalCode?: string;
  latitude: number;
  longitude: number;
  amenities?: string[];
  accessType?: "PUBLIC" | "PRIVATE" | "RESTRICTED";
  openingHours?: { label?: string; alwaysOpen?: boolean; timezone?: string };
  status?: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
}

export async function createStation(input: StationInput) {
  return apiFetch<Station>("/stations", { method: "POST", body: JSON.stringify(input) });
}

export async function updateStation(id: string, input: Partial<StationInput>) {
  return apiFetch<Station>(`/stations/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function createCharger(input: {
  stationId: string;
  serialNumber: string;
  model?: string;
  maxPowerKw: number;
}) {
  return apiFetch<Charger>("/chargers", { method: "POST", body: JSON.stringify(input) });
}

export async function updateCharger(
  id: string,
  input: { model?: string; maxPowerKw?: number; status?: string },
) {
  return apiFetch<Charger>(`/chargers/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function createConnector(input: {
  chargerId: string;
  number: number;
  type: string;
  maxPowerKw: number;
}) {
  return apiFetch<Connector>("/connectors", { method: "POST", body: JSON.stringify(input) });
}

export async function updateConnector(
  id: string,
  input: { type?: string; maxPowerKw?: number; status?: string },
) {
  return apiFetch<Connector>(`/connectors/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

function readErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || !("message" in data)) return fallback;
  const message = (data as { message: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(String).join(", ");
  return fallback;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    if (typeof window !== "undefined") window.location.assign("/login");
    throw new Error("Sessão expirada");
  }

  if (!res.ok) throw new Error(readErrorMessage(data, "Falha na requisição"));
  return data as T;
}

export async function login(email: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json().catch(() => ({}))) as { user?: AuthUser; message?: string };
  if (!res.ok) throw new Error(readErrorMessage(data, "Não foi possível entrar"));
  if (!data.user || !isAdminPanelRole(data.user.role)) {
    throw new Error("Esta conta não tem acesso ao painel administrativo.");
  }
  return data;
}

export async function logout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
}

export async function getWsToken() {
  const res = await fetch("/api/auth/ws-token", { credentials: "include" });
  const data = (await res.json().catch(() => ({}))) as { token?: string };
  if (!res.ok || !data.token) throw new Error("Sessão expirada");
  return data.token;
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
  userId: string;
  userName: string;
  vehicle: { brand: string; model: string };
  station: { id: string; name: string; address: string };
  charger: { id: string; serialNumber: string; maxPowerKw: number; status: string };
  connector: { id: string; number: number; type: string; status: string; maxPowerKw: number };
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
    body: JSON.stringify({
      connectorId,
      vehicleId,
      idempotencyKey: crypto.randomUUID(),
    }),
  });
}

export async function stopSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/stop`, {
    method: "POST",
    body: JSON.stringify({ idempotencyKey: `stop-${sessionId}` }),
  });
}

export async function getSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}`);
}

export async function listSessions(params?: {
  status?: string;
  stationId?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.stationId) query.set("stationId", params.stationId);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return apiFetch<SessionsListResponse>(`/sessions${qs ? `?${qs}` : ""}`);
}

export async function listActiveSessions() {
  return apiFetch<ChargingSession[]>("/sessions/active/live");
}

export async function chargerDemoAction(
  chargerId: string,
  action: "offline" | "maintenance" | "fault" | "restore",
) {
  return apiFetch<{ chargerId: string; action: string; status: string }>(
    `/chargers/${chargerId}/demo-action`,
    { method: "POST", body: JSON.stringify({ action }) },
  );
}

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(
  /\/api$/,
  "",
);

export function getRealtimeUrl() {
  return `${WS_URL}/realtime`;
}

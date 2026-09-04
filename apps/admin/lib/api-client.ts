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
  assignedTariffId?: string | null;
}

export interface Charger {
  id: string;
  stationId: string;
  serialNumber: string;
  identity?: string;
  model: string | null;
  vendor?: string | null;
  firmwareVersion?: string | null;
  protocol?: string | null;
  protocolLabel?: string;
  maxPowerKw: number;
  status: string;
  lastSeenAt?: string | null;
  providerId: string | null;
  ocppOnline?: boolean;
  ocppConnectedAt?: string | null;
  connectors: Connector[];
  station?: { id: string; name: string; companyId: string };
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
  tariffId?: string | null;
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
  tariffId?: string | null;
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
  tariffId?: string | null;
}) {
  return apiFetch<Connector>("/connectors", { method: "POST", body: JSON.stringify(input) });
}

export async function updateConnector(
  id: string,
  input: { type?: string; maxPowerKw?: number; status?: string; tariffId?: string | null },
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

export async function listChargers(stationId?: string) {
  const query = stationId ? `?stationId=${stationId}` : "";
  return apiFetch<Charger[]>(`/chargers${query}`);
}

export async function getChargerOcpp(id: string) {
  return apiFetch<OcppChargerDetail>(`/chargers/${id}/ocpp`);
}

export interface ChargerEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OcppChargerDetail extends Charger {
  events: ChargerEvent[];
  currentTransaction: {
    id: string;
    ocppTransactionId: number;
    sessionId: string;
    connectorNumber: number;
    startedAt: string;
    session?: { id: string; status: string; energyKwh: number; costCents: number };
  } | null;
}

export async function sendOcppCommand(
  chargerId: string,
  body: {
    action: "REMOTE_START" | "REMOTE_STOP" | "RESET" | "CHANGE_AVAILABILITY";
    connectorNumber?: number;
    idTag?: string;
    availability?: "Inoperative" | "Operative";
    resetType?: "Hard" | "Soft";
    confirm: true;
  },
) {
  return apiFetch<{ chargerId: string; action: string; accepted: boolean }>(
    `/chargers/${chargerId}/ocpp/command`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function chargerDemoAction(
  chargerId: string,
  action: "offline" | "maintenance" | "fault" | "restore" | "disable" | "enable" | "simulate_fault",
) {
  return apiFetch<{ chargerId: string; action: string; status: string }>(
    `/chargers/${chargerId}/demo-action`,
    { method: "POST", body: JSON.stringify({ action }) },
  );
}

export async function pauseSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/pause`, { method: "POST" });
}

export async function resumeSession(sessionId: string) {
  return apiFetch<ChargingSession>(`/sessions/${sessionId}/resume`, { method: "POST" });
}

export interface Tariff {
  id: string;
  companyId: string;
  name: string;
  pricePerKwhCents: number;
  pricePerMinuteCents: number;
  idleFeeCents: number;
  connectionFeeCents: number;
  minBalanceCents: number;
  currency: string;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

export async function listTariffs() {
  return apiFetch<Tariff[]>("/tariffs");
}

export async function createTariff(input: {
  companyId: string;
  name: string;
  pricePerKwhCents: number;
  pricePerMinuteCents?: number;
  idleFeeCents?: number;
  connectionFeeCents?: number;
  minBalanceCents?: number;
}) {
  return apiFetch<Tariff>("/tariffs", { method: "POST", body: JSON.stringify(input) });
}

export async function updateTariff(id: string, input: Partial<Tariff>) {
  return apiFetch<Tariff>(`/tariffs/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteTariff(id: string) {
  return apiFetch<{ id: string; deleted?: boolean; active?: boolean }>(`/tariffs/${id}`, {
    method: "DELETE",
  });
}

export interface TeamPayload {
  members: Array<{
    id: string;
    userId: string;
    email: string;
    fullName: string;
    role: string;
    memberRole: string;
    status: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    token?: string;
    acceptUrl?: string;
  }>;
}

export async function getTeam(companyId?: string) {
  const qs = companyId ? `?companyId=${companyId}` : "";
  return apiFetch<TeamPayload>(`/invitations${qs}`);
}

export async function createInvitation(input: { email: string; companyId: string; role: "OPERATOR" | "ADMIN" }) {
  return apiFetch<TeamPayload["invitations"][number]>("/invitations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function revokeInvitation(id: string) {
  return apiFetch(`/invitations/${id}/revoke`, { method: "POST" });
}

export async function previewInvitation(token: string) {
  const res = await fetch(`/api/proxy/invitations/${token}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readErrorMessage(data, "Convite inválido"));
  return data as { email: string; role: string; status: string; expiresAt: string };
}

export async function acceptInvitation(token: string, input: { fullName: string; password: string }) {
  const res = await fetch(`/api/proxy/invitations/${token}/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(readErrorMessage(data, "Não foi possível aceitar o convite"));
  return data as { user: AuthUser; accessToken: string };
}

export async function getOpsSummary() {
  return apiFetch<{
    stations: number;
    chargers: number;
    availableChargers: number;
    occupiedChargers: number;
    offlineChargers: number;
    activeSessions: number;
    demoRevenueCents: number;
    energyKwh: number;
    activeCustomers: number;
  }>("/ops/summary");
}

export async function listOpsPayments() {
  return apiFetch<
    Array<{
      id: string;
      amountCents: number;
      method: string;
      createdAt: string;
      session: { connector: { charger: { station: { name: string } } }; user: { profile: { fullName: string } | null } } | null;
    }>
  >("/ops/payments");
}

export async function forgotPassword(email: string) {
  const res = await fetch("/api/proxy/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return (await res.json()) as { message: string; resetToken?: string };
}

export async function resetPassword(token: string, password: string) {
  const res = await fetch("/api/proxy/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) throw new Error("Não foi possível redefinir a senha");
}

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(
  /\/api$/,
  "",
);

export function getRealtimeUrl() {
  return `${WS_URL}/realtime`;
}

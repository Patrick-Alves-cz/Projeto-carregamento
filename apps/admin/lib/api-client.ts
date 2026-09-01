const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

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
  latitude: number;
  longitude: number;
  status: string;
  amenities: string[];
  createdAt: string;
  updatedAt: string;
  availability: {
    totalConnectors: number;
    availableConnectors: number;
    occupiedConnectors: number;
  };
  chargers: Charger[];
}

export function getStoredTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("evcharge_auth");
  return raw ? (JSON.parse(raw) as AuthTokens) : null;
}

export function storeTokens(tokens: AuthTokens) {
  localStorage.setItem("evcharge_auth", JSON.stringify(tokens));
  document.cookie = `evcharge_token=${tokens.accessToken}; path=/; max-age=604800; SameSite=Lax`;
}

export function clearTokens() {
  localStorage.removeItem("evcharge_auth");
  document.cookie = "evcharge_token=; path=/; max-age=0";
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
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });
    const data = (await res.json().catch(() => ({}))) as AuthTokens;
    if (!res.ok || !data.accessToken) return false;
    storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const tokens = getStoredTokens();
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
    clearTokens();
    if (typeof window !== "undefined") window.location.assign("/login");
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
  storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data;
}

export async function logout() {
  const tokens = getStoredTokens();
  if (tokens?.refreshToken) {
    await apiFetch("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).catch(() => undefined);
  }
  clearTokens();
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

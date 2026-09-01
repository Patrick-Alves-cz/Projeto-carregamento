const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  profile: { fullName: string } | null;
  companies: { id: string; name: string; slug: string; memberRole: string }[];
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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const tokens = getStoredTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Request failed");
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

export async function getMe() {
  return apiFetch<AuthUser>("/auth/me");
}

const PLACEHOLDER_SECRETS = new Set([
  "dev-access-secret-change-me",
  "dev-refresh-secret-change-me",
  "change-me-access-secret-min-32-chars",
  "change-me-refresh-secret-min-32-chars",
]);

const TEST_ACCESS_SECRET = "test-only-jwt-access-secret-32chars!!";
const TEST_REFRESH_SECRET = "test-only-jwt-refresh-secret-32chars!";

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

function assertSecret(name: string, value: string | undefined, testFallback: string): string {
  const secret = value?.trim() ?? "";
  const invalid = secret.length < 32 || PLACEHOLDER_SECRETS.has(secret);

  if (!invalid) return secret;

  if (isTestEnv()) {
    return secret.length >= 16 ? secret : testFallback;
  }

  throw new Error(
    `${name} is required, must be at least 32 characters, and must not use a documented placeholder. Refusing to start.`,
  );
}

export function getRequiredJwtAccessSecret(): string {
  return assertSecret("JWT_ACCESS_SECRET", process.env.JWT_ACCESS_SECRET, TEST_ACCESS_SECRET);
}

export function getRequiredJwtRefreshSecret(): string {
  return assertSecret("JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET, TEST_REFRESH_SECRET);
}

export function getJwtAccessExpiresIn(): `${number}m` | `${number}h` | `${number}d` | `${number}s` {
  return (process.env.JWT_ACCESS_EXPIRES_IN ?? "15m") as `${number}m`;
}

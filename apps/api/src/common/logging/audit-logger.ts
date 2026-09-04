import { Logger } from "@nestjs/common";

const REDACT_KEYS = new Set([
  "password",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "authorization",
  "cookie",
  "tokenHash",
  "credentialHash",
  "credential",
]);

function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (REDACT_KEYS.has(key) || /token|secret|password/i.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export class AuditLogger {
  constructor(private readonly logger: Logger) {}

  info(event: string, data: Record<string, unknown> = {}): void {
    this.logger.log({ event, ...sanitize(data) });
  }

  warn(event: string, data: Record<string, unknown> = {}): void {
    this.logger.warn({ event, ...sanitize(data) });
  }

  error(event: string, data: Record<string, unknown> = {}): void {
    this.logger.error({ event, ...sanitize(data) });
  }
}

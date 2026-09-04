import { Logger } from "@nestjs/common";
import { AuditLogger } from "../common/logging/audit-logger";

export class OcppLogger {
  private readonly audit: AuditLogger;

  constructor(logger: Logger) {
    this.audit = new AuditLogger(logger);
  }

  info(event: string, data: Record<string, unknown> = {}) {
    this.audit.info(event, data);
  }

  warn(event: string, data: Record<string, unknown> = {}) {
    this.audit.warn(event, data);
  }

  error(event: string, data: Record<string, unknown> = {}) {
    this.audit.error(event, data);
  }
}

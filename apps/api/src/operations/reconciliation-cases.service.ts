import { Injectable } from "@nestjs/common";
import { ReconciliationCaseStatus, SessionStatus } from "@prisma/client";
import { NotFoundError } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { OcppConnectionManager } from "../ocpp/ocpp-connection.manager";

const LIVE: SessionStatus[] = [
  SessionStatus.PENDING,
  SessionStatus.PREPARING,
  SessionStatus.ACTIVE,
  SessionStatus.PAUSED,
  SessionStatus.CHARGING_COMPLETE,
  SessionStatus.IDLE,
];

@Injectable()
export class ReconciliationCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantAccessService,
    private readonly connections: OcppConnectionManager,
  ) {}

  async open(input: {
    companyId: string;
    chargerId: string;
    sessionId?: string;
    reason: string;
    classification: "RECOVERABLE" | "REQUIRES_RECONCILIATION" | "CRITICAL";
  }) {
    const existing = await this.prisma.reconciliationCase.findFirst({
      where: {
        chargerId: input.chargerId,
        sessionId: input.sessionId ?? null,
        reason: input.reason,
        status: ReconciliationCaseStatus.OPEN,
      },
    });
    if (existing) return existing;
    return this.prisma.reconciliationCase.create({
      data: {
        companyId: input.companyId,
        chargerId: input.chargerId,
        sessionId: input.sessionId,
        reason: input.reason,
        classification: input.classification,
      },
    });
  }

  async detect() {
    const staleMeterMs = Number(process.env.SESSION_STALE_METER_MS ?? 5 * 60_000);
    const remoteStopMs = Number(process.env.REMOTE_STOP_TIMEOUT_MS ?? 3 * 60_000);
    const live = await this.prisma.chargingSession.findMany({
      where: { status: { in: LIVE } },
      include: { connector: { include: { charger: { include: { station: true } } } }, ocppTxs: true },
    });
    for (const session of live) {
      const charger = session.connector.charger;
      const companyId = charger.station.companyId;
      const online = this.connections.isOnline(charger.id);
      if (!online && (charger.providerId === "ocpp16" || charger.providerId === "ocpp")) {
        await this.open({
          companyId,
          chargerId: charger.id,
          sessionId: session.id,
          reason: "ACTIVE_SESSION_CHARGER_OFFLINE",
          classification: session.status === SessionStatus.ACTIVE ? "CRITICAL" : "REQUIRES_RECONCILIATION",
        });
        await this.prisma.chargingSession.update({
          where: { id: session.id },
          data: { watchdogClass: session.status === SessionStatus.ACTIVE ? "CRITICAL" : "REQUIRES_RECONCILIATION" },
        });
      }
      if (session.status === SessionStatus.ACTIVE) {
        const lastMeter = session.lastMeterAt;
        if (lastMeter && Date.now() - lastMeter.getTime() > staleMeterMs) {
          await this.open({
            companyId,
            chargerId: charger.id,
            sessionId: session.id,
            reason: "STALE_TELEMETRY",
            classification: "RECOVERABLE",
          });
          await this.prisma.chargingSession.update({
            where: { id: session.id },
            data: { watchdogClass: "RECOVERABLE" },
          });
        }
      }
      if (session.remoteStopPending && session.updatedAt.getTime() < Date.now() - remoteStopMs) {
        await this.open({
          companyId,
          chargerId: charger.id,
          sessionId: session.id,
          reason: "REMOTE_STOP_TIMEOUT",
          classification: "REQUIRES_RECONCILIATION",
        });
      }
      if (
        (charger.providerId === "ocpp16" || charger.providerId === "ocpp") &&
        session.status === SessionStatus.ACTIVE &&
        session.ocppTxs.length === 0
      ) {
        await this.open({
          companyId,
          chargerId: charger.id,
          sessionId: session.id,
          reason: "SESSION_WITHOUT_OCPP_TX",
          classification: "REQUIRES_RECONCILIATION",
        });
      }
    }
  }

  async list(user: AuthenticatedUser) {
    this.tenant.assertOperatorOrAbove(user);
    return this.prisma.reconciliationCase.findMany({
      where: this.tenant.isSuperAdmin(user) ? {} : { companyId: { in: user.companyIds } },
      include: { charger: true, session: true },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });
  }

  async resolve(user: AuthenticatedUser, id: string, resolution: string) {
    const item = await this.prisma.reconciliationCase.findUnique({ where: { id } });
    if (!item) throw new NotFoundError("ReconciliationCase", id);
    this.tenant.assertCompanyAccess(user, item.companyId);
    return this.prisma.reconciliationCase.update({
      where: { id },
      data: { status: ReconciliationCaseStatus.RESOLVED, resolvedAt: new Date(), resolution },
    });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import {
  ChargerStatus,
  ConnectorStatus,
  Prisma,
  SessionStatus,
} from "@prisma/client";
import {
  assertChargerStatusTransition,
  assertConnectorStatusTransition,
} from "@evcharge/domain";
import { fromProviderChargerStatus, fromProviderConnectorStatus } from "../charging/utils/charger-status.util";
import type { ConnectorOperationalStatus } from "@evcharge/charger-provider";
import { PrismaService } from "../common/database/database.module";
import { ChargingEventsService } from "../charging/charging-events.service";
import { SessionsService } from "../sessions/sessions.service";
import { SessionMeterProcessor } from "../sessions/session-meter.processor";
import { OcppLogger } from "./ocpp-logger";

@Injectable()
export class OcppInboundService {
  private readonly logger = new OcppLogger(new Logger(OcppInboundService.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChargingEventsService,
    private readonly sessions: SessionsService,
    private readonly meters: SessionMeterProcessor,
  ) {}

  async recordChargerEvent(chargerId: string, type: string, payload: Record<string, unknown>) {
    await this.prisma.chargerEvent.create({
      data: { chargerId, type, payload: payload as Prisma.InputJsonValue },
    });
  }

  async markConnected(chargerId: string, companyId: string) {
    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { lastSeenAt: new Date(), protocol: "ocpp1.6" },
    });
    await this.events.publish({
      type: "charger.connected",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: { chargerId, companyId },
    });
    await this.recordChargerEvent(chargerId, "connected", { companyId });
  }

  async markDisconnected(chargerId: string, companyId: string) {
    const charger = await this.prisma.charger.findUnique({ where: { id: chargerId } });
    if (!charger) return;
    if (charger.status !== ChargerStatus.OFFLINE) {
      try {
        assertChargerStatusTransition(charger.status, ChargerStatus.OFFLINE);
      } catch {
        // keep current status if a session is still charging; watchdog/reconciler will handle it
      }
      await this.prisma.charger.update({
        where: { id: chargerId },
        data: { lastSeenAt: new Date() },
      });
    }
    await this.events.publish({
      type: "charger.disconnected",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: { chargerId, companyId },
    });
    await this.recordChargerEvent(chargerId, "disconnected", { companyId });
  }

  async applyBoot(
    chargerId: string,
    companyId: string,
    boot: {
      chargePointVendor: string;
      chargePointModel: string;
      firmwareVersion?: string;
      chargePointSerialNumber?: string;
    },
  ) {
    await this.prisma.charger.update({
      where: { id: chargerId },
      data: {
        vendor: boot.chargePointVendor,
        model: boot.chargePointModel,
        firmwareVersion: boot.firmwareVersion,
        chargePointSerialNumber: boot.chargePointSerialNumber,
        lastSeenAt: new Date(),
        protocol: "ocpp1.6",
      },
    });
    const liveSession = await this.prisma.chargingSession.findFirst({
      where: {
        connector: { chargerId },
        status: { in: [SessionStatus.PENDING, SessionStatus.PREPARING, SessionStatus.ACTIVE, SessionStatus.PAUSED] },
      },
    });
    if (!liveSession) {
      const charger = await this.prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
      if (charger.status !== ChargerStatus.AVAILABLE) {
        try {
          assertChargerStatusTransition(charger.status, ChargerStatus.AVAILABLE);
          await this.prisma.charger.update({
            where: { id: chargerId },
            data: { status: ChargerStatus.AVAILABLE },
          });
        } catch {
          await this.prisma.charger.update({
            where: { id: chargerId },
            data: { lastSeenAt: new Date() },
          });
        }
      }
      await this.prisma.connector.updateMany({
        where: { chargerId, status: ConnectorStatus.UNAVAILABLE },
        data: { status: ConnectorStatus.AVAILABLE },
      });
    }
    await this.events.publish({
      type: "charger.booted",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: { chargerId, companyId, vendor: boot.chargePointVendor, model: boot.chargePointModel },
    });
    this.logger.info("ocpp.boot.accepted", { chargerId });
    await this.recordChargerEvent(chargerId, "booted", { vendor: boot.chargePointVendor });
  }

  async heartbeat(chargerId: string, companyId: string) {
    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { lastSeenAt: new Date() },
    });
    await this.events.publish({
      type: "charger.heartbeat",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: { chargerId, companyId },
    });
  }

  async applyConnectorStatus(
    chargerId: string,
    companyId: string,
    connectorNumber: number,
    mapped: ConnectorOperationalStatus,
    errorCode?: string,
  ) {
    if (connectorNumber === 0) {
      const chargerStatus = fromProviderChargerStatus(
        mapped === "faulted" ? "faulted" : mapped === "unavailable" ? "unavailable" : "available",
      );
      const charger = await this.prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
      if (charger.status !== chargerStatus) {
        try {
          assertChargerStatusTransition(charger.status, chargerStatus);
          await this.prisma.charger.update({
            where: { id: chargerId },
            data: { status: chargerStatus, lastSeenAt: new Date() },
          });
        } catch {
          await this.prisma.charger.update({ where: { id: chargerId }, data: { lastSeenAt: new Date() } });
        }
      }
      this.logger.info("ocpp.status.changed", { chargerId, connectorNumber: 0, status: chargerStatus });
      return;
    }

    const connector = await this.prisma.connector.findFirst({
      where: { chargerId, number: connectorNumber },
    });
    if (!connector) {
      this.logger.warn("ocpp.unknown.connector", { chargerId, connectorNumber });
      return;
    }

    const next = fromProviderConnectorStatus(mapped);
    if (connector.status !== next) {
      try {
        assertConnectorStatusTransition(connector.status, next);
      } catch {
        // equipment is source of truth for live OCPP status
      }
      await this.prisma.connector.update({ where: { id: connector.id }, data: { status: next } });
    }

    await this.prisma.charger.update({
      where: { id: chargerId },
      data: {
        lastSeenAt: new Date(),
        status:
          next === ConnectorStatus.FAULTED
            ? ChargerStatus.FAULTED
            : next === ConnectorStatus.CHARGING
              ? ChargerStatus.CHARGING
              : next === ConnectorStatus.PREPARING
                ? ChargerStatus.PREPARING
                : next === ConnectorStatus.SUSPENDED
                  ? ChargerStatus.SUSPENDED
                  : next === ConnectorStatus.FINISHING
                    ? ChargerStatus.FINISHING
                    : ChargerStatus.AVAILABLE,
      },
    });

    if (next === ConnectorStatus.FAULTED) {
      await this.events.publish({
        type: "charger.faulted",
        entityType: "charger",
        entityId: chargerId,
        timestamp: new Date(),
        payload: { chargerId, companyId, connectorId: connector.id, errorCode },
      });
    }

    await this.events.publish({
      type: "connector.status.changed",
      entityType: "connector",
      entityId: connector.id,
      timestamp: new Date(),
      payload: {
        chargerId,
        connectorId: connector.id,
        companyId,
        status: next,
        previousStatus: connector.status,
      },
    });
    this.logger.info("ocpp.status.changed", { chargerId, connectorNumber, status: next });
  }

  async authorize(idTag: string) {
    const auth = await this.prisma.ocppAuthorization.findUnique({ where: { idTag } });
    if (!auth || auth.expiresAt < new Date()) return { status: "Invalid" as const };
    return { status: "Accepted" as const };
  }

  async startTransaction(params: {
    chargerId: string;
    companyId: string;
    connectorNumber: number;
    idTag: string;
    meterStartWh: number;
    timestamp: Date;
  }) {
    const existing = await this.prisma.ocppTransaction.findFirst({
      where: {
        chargerId: params.chargerId,
        idTag: params.idTag,
        stoppedAt: null,
      },
    });
    if (existing) {
      this.logger.info("ocpp.transaction.started", { chargerId: params.chargerId, replay: true });
      return { transactionId: existing.ocppTransactionId, idTagInfo: { status: "Accepted" } };
    }

    const connector = await this.prisma.connector.findFirst({
      where: { chargerId: params.chargerId, number: params.connectorNumber },
    });
    if (!connector) {
      this.logger.warn("ocpp.unknown.connector", {
        chargerId: params.chargerId,
        connectorNumber: params.connectorNumber,
      });
      return { transactionId: -1, idTagInfo: { status: "Invalid" } };
    }

    const auth = await this.prisma.ocppAuthorization.findUnique({ where: { idTag: params.idTag } });
    const session = auth
      ? await this.prisma.chargingSession.findUnique({ where: { id: auth.sessionId } })
      : await this.prisma.chargingSession.findFirst({
          where: { connectorId: connector.id, idTag: params.idTag, status: { in: [SessionStatus.PENDING, SessionStatus.PREPARING] } },
        });

    if (!session) {
      return { transactionId: -1, idTagInfo: { status: "Invalid" } };
    }

    const last = await this.prisma.ocppTransaction.findFirst({
      where: { chargerId: params.chargerId },
      orderBy: { ocppTransactionId: "desc" },
    });
    const ocppTransactionId = (last?.ocppTransactionId ?? 0) + 1;

    await this.prisma.ocppTransaction.create({
      data: {
        chargerId: params.chargerId,
        connectorId: connector.id,
        connectorNumber: params.connectorNumber,
        sessionId: session.id,
        ocppTransactionId,
        idTag: params.idTag,
        meterStartWh: params.meterStartWh,
        startedAt: params.timestamp,
      },
    });

    await this.sessions.confirmStartFromEquipment(session.id, params.timestamp);
    this.logger.info("ocpp.transaction.started", {
      chargerId: params.chargerId,
      sessionId: session.id,
      ocppTransactionId,
    });
    return { transactionId: ocppTransactionId, idTagInfo: { status: "Accepted" } };
  }

  async ingestMeter(params: {
    chargerId: string;
    companyId: string;
    connectorNumber: number;
    transactionId?: number;
    timestamp: Date;
    energyKwh?: number;
    powerKw?: number;
    voltage?: number;
    current?: number;
    socPercent?: number;
  }) {
    let sessionId: string | undefined;
    if (params.transactionId != null && params.transactionId >= 0) {
      const tx = await this.prisma.ocppTransaction.findUnique({
        where: {
          chargerId_ocppTransactionId: {
            chargerId: params.chargerId,
            ocppTransactionId: params.transactionId,
          },
        },
      });
      sessionId = tx?.sessionId;
    }
    if (!sessionId) {
      const connector = await this.prisma.connector.findFirst({
        where: { chargerId: params.chargerId, number: params.connectorNumber },
      });
      if (!connector) {
        this.logger.warn("ocpp.unknown.connector", {
          chargerId: params.chargerId,
          connectorNumber: params.connectorNumber,
        });
        return;
      }
      const live = await this.prisma.chargingSession.findFirst({
        where: { connectorId: connector.id, status: { in: [SessionStatus.ACTIVE, SessionStatus.PAUSED] } },
        orderBy: { createdAt: "desc" },
      });
      sessionId = live?.id;
    }
    if (!sessionId) return;

    await this.meters.ingestMeterValue({
      chargerId: params.chargerId,
      connectorNumber: params.connectorNumber,
      sessionId,
      reading: {
        timestamp: params.timestamp,
        energyKwh: params.energyKwh ?? 0,
        powerKw: params.powerKw ?? 0,
        voltage: params.voltage,
        current: params.current,
        socPercent: params.socPercent,
      },
    });
    if (params.socPercent != null) {
      await this.prisma.chargingSession.update({
        where: { id: sessionId },
        data: { socPercent: params.socPercent },
      });
    }
    this.logger.info("ocpp.meter.received", { chargerId: params.chargerId, sessionId });
  }

  async stopTransaction(params: {
    chargerId: string;
    companyId: string;
    transactionId: number;
    meterStopWh: number;
    timestamp: Date;
    reason?: string;
    idTag?: string;
  }) {
    const tx = await this.prisma.ocppTransaction.findUnique({
      where: {
        chargerId_ocppTransactionId: {
          chargerId: params.chargerId,
          ocppTransactionId: params.transactionId,
        },
      },
    });
    if (!tx) {
      this.logger.warn("ocpp.unknown.transaction", {
        chargerId: params.chargerId,
        transactionId: params.transactionId,
      });
      return { idTagInfo: { status: "Invalid" } };
    }
    if (tx.stoppedAt) {
      return { idTagInfo: { status: "Accepted" } };
    }

    await this.prisma.ocppTransaction.update({
      where: { id: tx.id },
      data: {
        meterStopWh: params.meterStopWh,
        stoppedAt: params.timestamp,
        stopReason: params.reason,
      },
    });

    const energyKwh = Math.max(0, (params.meterStopWh - tx.meterStartWh) / 1000);
    await this.sessions.confirmStopFromEquipment(tx.sessionId, {
      energyKwh,
      timestamp: params.timestamp,
      reason: params.reason,
    });
    this.logger.info("ocpp.transaction.stopped", {
      chargerId: params.chargerId,
      sessionId: tx.sessionId,
      transactionId: params.transactionId,
    });
    return { idTagInfo: { status: "Accepted" } };
  }

  async lookupTransactionId(chargerId: string, connectorNumber: number): Promise<number | null> {
    const live = await this.prisma.ocppTransaction.findFirst({
      where: { chargerId, connectorNumber, stoppedAt: null },
      orderBy: { startedAt: "desc" },
    });
    return live?.ocppTransactionId ?? null;
  }

  async markOffline(chargerId: string) {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { station: true },
    });
    if (!charger || charger.status === ChargerStatus.OFFLINE) return;
    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { status: ChargerStatus.OFFLINE },
    });
    await this.events.publish({
      type: "charger.status.changed",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: {
        chargerId,
        companyId: charger.station.companyId,
        status: ChargerStatus.OFFLINE,
        previousStatus: charger.status,
      },
    });
    await this.recordChargerEvent(chargerId, "offline", {});
  }
}

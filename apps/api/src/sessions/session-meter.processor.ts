import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import {
  calculateCostCents,
  InsufficientBalanceError,
  isSessionActive,
} from "@evcharge/domain";
import type { MeterValueCallbackEvent, StatusChangeCallbackEvent } from "@evcharge/charger-provider";
import {
  ChargerStatus,
  ConnectorStatus,
  Prisma,
  SessionStatus,
  SessionStopReason,
} from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { ChargingEventsService } from "../charging/charging-events.service";
import { ChargerProviderService } from "../charging/charger-provider.service";
import { fromProviderChargerStatus, fromProviderConnectorStatus } from "../charging/utils/charger-status.util";
import { WalletService } from "../wallet/wallet.service";

@Injectable()
export class SessionMeterProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionMeterProcessor.name);
  private unsubMeter?: () => void;
  private unsubStatus?: () => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chargerProviderService: ChargerProviderService,
    private readonly events: ChargingEventsService,
    private readonly walletService: WalletService,
  ) {}

  onModuleInit(): void {
    const mock = this.chargerProviderService.mockProvider;
    if (!mock) return;

    this.unsubMeter = mock.subscribeMeterValues((event) => {
      void this.handleMeterValue(event);
    });
    this.unsubStatus = mock.subscribeStatusChanges((event) => {
      void this.handleStatusChange(event);
    });
  }

  onModuleDestroy(): void {
    this.unsubMeter?.();
    this.unsubStatus?.();
  }

  private async handleMeterValue(event: MeterValueCallbackEvent): Promise<void> {
    try {
      const session = await this.prisma.chargingSession.findUnique({
        where: { id: event.sessionId },
      });

      if (!session || session.status !== SessionStatus.ACTIVE) return;

      const snapshot = session.tariffSnapshot as { pricePerKwhCents: number };
      const costCents = calculateCostCents(event.reading.energyKwh, snapshot.pricePerKwhCents);
      const previousCostCents = session.costCents;
      const deltaCents = costCents - previousCostCents;

      await this.prisma.$transaction(async (tx) => {
        await tx.chargingSession.update({
          where: { id: session.id },
          data: {
            energyKwh: event.reading.energyKwh,
            currentPowerKw: event.reading.powerKw,
            currentVoltage: event.reading.voltage,
            currentAmperage: event.reading.current,
            costCents,
          },
        });

        await tx.meterValue.create({
          data: {
            sessionId: session.id,
            timestamp: event.reading.timestamp,
            energyKwh: event.reading.energyKwh,
            powerKw: event.reading.powerKw,
            voltage: event.reading.voltage,
            current: event.reading.current,
            temperature: event.reading.temperature,
          },
        });

        if (deltaCents > 0) {
          try {
            await this.walletService.debitForSession(tx, {
              userId: session.userId,
              sessionId: session.id,
              amountCents: deltaCents,
              description: `Recarga em andamento (${event.reading.energyKwh.toFixed(2)} kWh)`,
              idempotencyKey: `meter-${session.id}-${costCents}`,
            });
          } catch (error) {
            if (error instanceof InsufficientBalanceError) {
              await this.forceStopSession(tx, session.id, SessionStopReason.INSUFFICIENT_BALANCE);
            }
            throw error;
          }
        }
      });

      await this.events.publish({
        type: "meter.value",
        entityType: "session",
        entityId: session.id,
        timestamp: new Date(),
        payload: {
          sessionId: session.id,
          energyKwh: event.reading.energyKwh,
          powerKw: event.reading.powerKw,
          voltage: event.reading.voltage,
          current: event.reading.current,
          costCents,
        },
      });

      await this.events.publish({
        type: "session.updated",
        entityType: "session",
        entityId: session.id,
        timestamp: new Date(),
        payload: {
          sessionId: session.id,
          status: session.status,
          userId: session.userId,
          connectorId: session.connectorId,
          energyKwh: event.reading.energyKwh,
          powerKw: event.reading.powerKw,
          costCents,
        },
      });
    } catch (error) {
      if (error instanceof InsufficientBalanceError) {
        this.logger.warn(`Session ${event.sessionId} stopped due to insufficient balance`);
        return;
      }
      this.logger.error(`Failed to process meter value for session ${event.sessionId}`, error);
    }
  }

  private async handleStatusChange(event: StatusChangeCallbackEvent): Promise<void> {
    try {
      if (event.connectorNumber !== undefined) {
        const connector = await this.prisma.connector.findFirst({
          where: { chargerId: event.chargerId, number: event.connectorNumber },
        });
        if (!connector) return;

        const dbStatus = fromProviderConnectorStatus(
          event.status as Parameters<typeof fromProviderConnectorStatus>[0],
        );
        await this.prisma.connector.update({
          where: { id: connector.id },
          data: { status: dbStatus },
        });

        await this.events.publish({
          type: "connector.status.changed",
          entityType: "connector",
          entityId: connector.id,
          timestamp: new Date(),
          payload: {
            connectorId: connector.id,
            chargerId: event.chargerId,
            status: dbStatus,
            previousStatus: event.previousStatus,
            sessionId: event.sessionId,
          },
        });
      }

      if (
        event.connectorNumber === undefined &&
        ["available", "preparing", "charging", "suspended", "finishing", "unavailable", "faulted", "offline"].includes(
          event.status,
        )
      ) {
        const dbChargerStatus = fromProviderChargerStatus(
          event.status as Parameters<typeof fromProviderChargerStatus>[0],
        );
        await this.prisma.charger.update({
          where: { id: event.chargerId },
          data: { status: dbChargerStatus, lastSeenAt: new Date() },
        });

        await this.events.publish({
          type: "charger.status.changed",
          entityType: "charger",
          entityId: event.chargerId,
          timestamp: new Date(),
          payload: {
            chargerId: event.chargerId,
            status: dbChargerStatus,
            previousStatus: event.previousStatus,
            sessionId: event.sessionId,
            reason: event.reason,
          },
        });
      }

      if (event.reason === "fault" && event.sessionId) {
        await this.finalizeSession(event.sessionId, SessionStopReason.FAULT, SessionStatus.FAILED);
      }
      if (event.reason === "disconnected" && event.sessionId) {
        await this.finalizeSession(
          event.sessionId,
          SessionStopReason.DISCONNECTED,
          SessionStatus.FAILED,
        );
      }
    } catch (error) {
      this.logger.error(`Failed to process status change for charger ${event.chargerId}`, error);
    }
  }

  private async forceStopSession(
    tx: Prisma.TransactionClient,
    sessionId: string,
    reason: SessionStopReason,
  ): Promise<void> {
    const session = await tx.chargingSession.findUnique({
      where: { id: sessionId },
      include: { connector: { include: { charger: true } } },
    });
    if (!session || !isSessionActive(session.status)) return;

    const mock = this.chargerProviderService.mockProvider;
    if (mock) {
      try {
        await mock.stopCharging(session.connector.chargerId, session.connector.number);
      } catch {
        // Provider may already be faulted/offline
      }
    }

    await tx.chargingSession.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.FAILED,
        stopReason: reason,
        endedAt: new Date(),
      },
    });

    await tx.connector.update({
      where: { id: session.connectorId },
      data: { status: ConnectorStatus.AVAILABLE },
    });

    await tx.charger.update({
      where: { id: session.connector.chargerId },
      data: { status: ChargerStatus.AVAILABLE },
    });
  }

  private async finalizeSession(
    sessionId: string,
    reason: SessionStopReason,
    status: SessionStatus,
  ): Promise<void> {
    const session = await this.prisma.chargingSession.findUnique({
      where: { id: sessionId },
      include: { connector: { include: { charger: true } } },
    });
    if (!session || !isSessionActive(session.status)) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.chargingSession.update({
        where: { id: sessionId },
        data: { status, stopReason: reason, endedAt: new Date() },
      });
      await tx.connector.update({
        where: { id: session.connectorId },
        data: { status: ConnectorStatus.AVAILABLE },
      });
      await tx.charger.update({
        where: { id: session.connector.chargerId },
        data: { status: ChargerStatus.AVAILABLE },
      });
    });

    await this.events.publish({
      type: status === SessionStatus.FAILED ? "session.failed" : "session.completed",
      entityType: "session",
      entityId: sessionId,
      timestamp: new Date(),
      payload: { sessionId, status, reason },
    });
  }
}

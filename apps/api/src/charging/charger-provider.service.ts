import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  ChargerProviderFactory,
  MockChargerProvider,
  OcppChargerProvider,
  type ChargerProvider,
  type CommandOutcome,
  type ConnectorOperationalStatus,
  type OcppCommandPort,
} from "@evcharge/charger-provider";
import { PrismaService } from "../common/database/database.module";
import { toProviderConnectorStatus } from "./utils/charger-status.util";

@Injectable()
export class ChargerProviderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChargerProviderService.name);
  readonly provider: ChargerProvider;
  private ocppProvider: OcppChargerProvider | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {
    this.provider = ChargerProviderFactory.create("mock");
  }

  get mockProvider(): MockChargerProvider | null {
    return this.provider instanceof MockChargerProvider ? this.provider : null;
  }

  async onModuleInit(): Promise<void> {
    try {
      const port = this.moduleRef.get<OcppCommandPort>("OCPP_COMMAND_PORT", { strict: false });
      this.ocppProvider = new OcppChargerProvider(port);
    } catch {
      this.ocppProvider = null;
    }
    await this.syncChargersFromDatabase();
    this.logger.log("ChargerProvider initialized and chargers synced");
  }

  onModuleDestroy(): void {
    if (this.provider instanceof MockChargerProvider) {
      this.provider.dispose();
    }
  }

  usesOcpp(providerId: string | null | undefined): boolean {
    const global = process.env.CHARGER_PROVIDER_TYPE;
    if (global === "ocpp" || global === "ocpp16") return true;
    return providerId === "ocpp16" || providerId === "ocpp";
  }

  async forChargerId(chargerId: string): Promise<ChargerProvider> {
    const charger = await this.prisma.charger.findUnique({ where: { id: chargerId } });
    if (charger && this.usesOcpp(charger.providerId) && this.ocppProvider) {
      return this.ocppProvider;
    }
    return this.provider;
  }

  async startCharging(
    chargerId: string,
    connectorId: number,
    sessionId: string,
    options?: { idTag?: string },
  ): Promise<CommandOutcome | void> {
    const provider = await this.forChargerId(chargerId);
    return provider.startCharging(chargerId, connectorId, sessionId, options);
  }

  async stopCharging(chargerId: string, connectorId: number): Promise<CommandOutcome | void> {
    const provider = await this.forChargerId(chargerId);
    return provider.stopCharging(chargerId, connectorId);
  }

  async pauseCharging(chargerId: string, connectorId: number): Promise<void> {
    const provider = await this.forChargerId(chargerId);
    await provider.pauseCharging(chargerId, connectorId);
  }

  async resumeCharging(chargerId: string, connectorId: number): Promise<void> {
    const provider = await this.forChargerId(chargerId);
    await provider.resumeCharging(chargerId, connectorId);
  }

  async setAvailability(
    chargerId: string,
    connectorId: number,
    status: ConnectorOperationalStatus,
  ): Promise<void> {
    const provider = await this.forChargerId(chargerId);
    await provider.setAvailability(chargerId, connectorId, status);
  }

  async restart(chargerId: string): Promise<void> {
    const provider = await this.forChargerId(chargerId);
    await provider.restart(chargerId);
  }

  async syncChargersFromDatabase(): Promise<void> {
    const mock = this.mockProvider;
    if (!mock) return;

    const chargers = await this.prisma.charger.findMany({
      include: { connectors: { orderBy: { number: "asc" } } },
    });

    for (const charger of chargers) {
      if (this.usesOcpp(charger.providerId)) continue;
      await this.registerMockCharger(charger);
    }

    this.logger.log(`Synced mock chargers into MockChargerProvider`);
  }

  async syncCharger(chargerId: string): Promise<void> {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { connectors: { orderBy: { number: "asc" } } },
    });
    if (!charger || this.usesOcpp(charger.providerId)) return;
    await this.registerMockCharger(charger);
  }

  private async registerMockCharger(charger: {
    id: string;
    maxPowerKw: unknown;
    status: string;
    connectors: Array<{ number: number; maxPowerKw: unknown; status: Parameters<typeof toProviderConnectorStatus>[0] }>;
  }): Promise<void> {
    const mock = this.mockProvider;
    if (!mock) return;

    await mock.registerCharger(charger.id, {
      maxPowerKw: Number(charger.maxPowerKw),
      connectors: charger.connectors.map((c) => ({
        number: c.number,
        maxPowerKw: Number(c.maxPowerKw),
        status: toProviderConnectorStatus(c.status),
      })),
      meterIntervalMs: Number(process.env.METER_INTERVAL_MS ?? 3000),
    });

    if (charger.status !== "OFFLINE" && charger.status !== "FAULTED") {
      await mock.connect(charger.id);
    }
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  ChargerProviderFactory,
  MockChargerProvider,
  type ChargerProvider,
} from "@evcharge/charger-provider";
import { PrismaService } from "../common/database/database.module";
import { toProviderConnectorStatus } from "./utils/charger-status.util";

@Injectable()
export class ChargerProviderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChargerProviderService.name);
  readonly provider: ChargerProvider;

  constructor(private readonly prisma: PrismaService) {
    const type = (process.env.CHARGER_PROVIDER_TYPE ?? "mock") as "mock";
    this.provider = ChargerProviderFactory.create(type);
  }

  get mockProvider(): MockChargerProvider | null {
    return this.provider instanceof MockChargerProvider ? this.provider : null;
  }

  async onModuleInit(): Promise<void> {
    await this.syncChargersFromDatabase();
    this.logger.log("ChargerProvider initialized and chargers synced");
  }

  onModuleDestroy(): void {
    if (this.provider instanceof MockChargerProvider) {
      this.provider.dispose();
    }
  }

  async syncChargersFromDatabase(): Promise<void> {
    const mock = this.mockProvider;
    if (!mock) return;

    const chargers = await this.prisma.charger.findMany({
      include: { connectors: { orderBy: { number: "asc" } } },
    });

    for (const charger of chargers) {
      await this.registerMockCharger(charger);
    }

    this.logger.log(`Synced ${chargers.length} chargers into MockChargerProvider`);
  }

  async syncCharger(chargerId: string): Promise<void> {
    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { connectors: { orderBy: { number: "asc" } } },
    });
    if (!charger) return;
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

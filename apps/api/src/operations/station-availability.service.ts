import { Injectable } from "@nestjs/common";
import { ConnectorStatus, StationStatus } from "@prisma/client";
import { deriveStationAvailability, type StationAvailabilityState } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { MaintenanceService } from "./maintenance.service";

const OCCUPIED: ConnectorStatus[] = [
  ConnectorStatus.PREPARING,
  ConnectorStatus.CHARGING,
  ConnectorStatus.SUSPENDED,
  ConnectorStatus.FINISHING,
];

@Injectable()
export class StationAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenance: MaintenanceService,
  ) {}

  summarize(input: {
    stationStatus: StationStatus;
    inMaintenance: boolean;
    chargers: Array<{ status: string; connectors: Array<{ status: ConnectorStatus }> }>;
  }): {
    state: StationAvailabilityState;
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    faulted: number;
    offline: number;
  } {
    const connectors = input.chargers.flatMap((charger) =>
      charger.connectors.map((connector) => ({ charger, connector })),
    );
    const total = connectors.length;
    const available = connectors.filter(({ charger, connector }) => {
      if (["OFFLINE", "FAULTED", "UNAVAILABLE"].includes(charger.status)) return false;
      return connector.status === ConnectorStatus.AVAILABLE;
    }).length;
    const occupied = connectors.filter(({ connector }) => OCCUPIED.includes(connector.status)).length;
    const reserved = connectors.filter(({ connector }) => connector.status === ConnectorStatus.RESERVED).length;
    const faulted = connectors.filter(({ connector }) => connector.status === ConnectorStatus.FAULTED).length;
    const offline = input.chargers.reduce((count, charger) => {
      if (!["OFFLINE", "FAULTED", "UNAVAILABLE"].includes(charger.status)) return count;
      return count + charger.connectors.length;
    }, 0);
    const state = deriveStationAvailability(
      { total, available, occupied, reserved, faulted, offline },
      { stationStatus: input.stationStatus, inMaintenance: input.inMaintenance },
    );
    return { state, total, available, occupied, reserved, faulted, offline };
  }

  async forStation(stationId: string) {
    const station = await this.prisma.station.findUnique({
      where: { id: stationId },
      include: { chargers: { include: { connectors: true } } },
    });
    if (!station) return null;
    const inMaintenance = await this.maintenance.isResourceBlocked({ stationId });
    return this.summarize({
      stationStatus: station.status,
      inMaintenance,
      chargers: station.chargers,
    });
  }
}

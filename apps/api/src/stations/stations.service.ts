import { Injectable } from "@nestjs/common";
import {
  ConnectorStatus,
  Prisma,
  StationStatus,
  UserRole,
  type ConnectorType,
} from "@prisma/client";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  connectorMatchesCurrentType,
  isVehicleCompatibleWithConnector,
  pickEffectiveTariff,
  stationCurrentType,
  type TariffLike,
} from "@evcharge/domain";
import type {
  CreateStationInput,
  NearbyStationsQuery,
  UpdateStationInput,
  ListStationsQuery,
} from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { haversineDistanceKm } from "../common/utils/geo.util";
import { AuthenticatedUser } from "../common/types/auth.types";

const OCCUPIED_STATUSES: ConnectorStatus[] = [
  ConnectorStatus.PREPARING,
  ConnectorStatus.CHARGING,
  ConnectorStatus.SUSPENDED,
  ConnectorStatus.FINISHING,
  ConnectorStatus.RESERVED,
];

const OFFLINE_CHARGER_STATUSES = new Set(["OFFLINE", "FAULTED", "UNAVAILABLE"]);

const stationInclude = {
  tariff: true,
  chargers: {
    include: {
      connectors: { include: { tariff: true }, orderBy: { number: "asc" as const } },
    },
    orderBy: { serialNumber: "asc" as const },
  },
  company: {
    include: {
      tariffs: {
        where: { active: true },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
} as const;

type StationRecord = Prisma.StationGetPayload<{ include: typeof stationInclude }>;

function isTruthyFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ["true", "1", "AVAILABLE", "yes"].includes(value);
}

function maxPriceToCents(maxPrice: number): number {
  return Math.round(maxPrice * 100);
}

function openingHoursLabel(value: Prisma.JsonValue): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.alwaysOpen === true) return "24 horas";
  if (typeof record.label === "string" && record.label.trim()) return record.label;
  return null;
}

@Injectable()
export class StationsService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
  ) {}

  async findAll(query: ListStationsQuery, user: AuthenticatedUser) {
    const where = this.listWhere(user, query.status);
    let stations = await this.prisma.station.findMany({
      where,
      include: stationInclude,
      orderBy: { name: "asc" },
    });

    if (query.latitude !== undefined && query.longitude !== undefined && query.radiusKm) {
      stations = stations.filter((s) => {
        const dist = haversineDistanceKm(
          query.latitude!,
          query.longitude!,
          Number(s.latitude),
          Number(s.longitude),
        );
        return dist <= query.radiusKm!;
      });
    }

    if (query.minPowerKw) {
      stations = stations.filter((s) =>
        s.chargers.some((c) => Number(c.maxPowerKw) >= query.minPowerKw!),
      );
    }

    if (query.connectorType) {
      stations = stations.filter((s) =>
        s.chargers.some((c) => c.connectors.some((conn) => conn.type === query.connectorType)),
      );
    }

    return stations.map((s) => this.enrichStation(s));
  }

  async findNearby(query: NearbyStationsQuery, user: AuthenticatedUser) {
    const availableNow = isTruthyFlag(query.availability) || isTruthyFlag(query.availableNow);
    const vehicleTypes = await this.resolveVehicleTypes(query.vehicleId, user);

    const where: Prisma.StationWhereInput = {
      ...this.listWhere(user),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { address: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
              { postalCode: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const stations = await this.prisma.station.findMany({
      where,
      include: stationInclude,
    });

    const results = stations
      .map((station) => {
        const distanceKm = haversineDistanceKm(
          query.lat,
          query.lng,
          Number(station.latitude),
          Number(station.longitude),
        );
        return { station, distanceKm };
      })
      .filter(({ distanceKm }) => distanceKm <= query.radiusKm)
      .filter(({ station }) => this.matchesDiscoveryFilters(station, {
        connectorType: query.connectorType,
        powerMin: query.powerMin,
        maxPrice: query.maxPrice,
        availableNow,
        currentType: query.currentType,
        vehicleTypes,
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .map(({ station, distanceKm }) => this.toDiscoveryCard(station, distanceKm, vehicleTypes));

    return results;
  }

  async findOne(id: string, user: AuthenticatedUser, vehicleId?: string) {
    const station = await this.prisma.station.findUnique({
      where: { id },
      include: stationInclude,
    });
    if (!station) throw new NotFoundError("Station", id);

    if (user.role !== UserRole.DRIVER && user.role !== UserRole.SUPER_ADMIN) {
      this.tenantAccess.assertCompanyAccess(user, station.companyId);
    }

    const vehicleTypes = await this.resolveVehicleTypes(vehicleId, user);
    return this.enrichStation(station, vehicleTypes);
  }

  async create(input: CreateStationInput, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const companyId = this.resolveCompanyId(user);
    this.tenantAccess.assertCompanyAccess(user, companyId);
    if (input.tariffId) await this.assertCompanyTariff(input.tariffId, companyId);

    const station = await this.prisma.station.create({
      data: {
        companyId,
        name: input.name,
        address: input.address,
        city: input.city,
        postalCode: input.postalCode,
        latitude: input.latitude,
        longitude: input.longitude,
        amenities: input.amenities,
        accessType: input.accessType,
        openingHours: (input.openingHours ?? {}) as Prisma.InputJsonValue,
        tariffId: input.tariffId ?? undefined,
      },
      include: stationInclude,
    });
    return this.enrichStation(station);
  }

  async update(id: string, input: UpdateStationInput, user: AuthenticatedUser) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) throw new NotFoundError("Station", id);
    this.tenantAccess.assertCompanyAccess(user, station.companyId);
    this.tenantAccess.assertOperatorOrAbove(user);
    if (input.tariffId) await this.assertCompanyTariff(input.tariffId, station.companyId);

    const updated = await this.prisma.station.update({
      where: { id },
      data: {
        name: input.name,
        address: input.address,
        city: input.city,
        postalCode: input.postalCode,
        latitude: input.latitude,
        longitude: input.longitude,
        amenities: input.amenities,
        accessType: input.accessType,
        status: input.status,
        openingHours: input.openingHours as Prisma.InputJsonValue | undefined,
        tariffId: input.tariffId === undefined ? undefined : input.tariffId,
      },
      include: stationInclude,
    });
    return this.enrichStation(updated);
  }

  async remove(id: string, user: AuthenticatedUser) {
    const station = await this.prisma.station.findUnique({ where: { id } });
    if (!station) throw new NotFoundError("Station", id);
    this.tenantAccess.assertCompanyAccess(user, station.companyId);
    this.tenantAccess.assertAdminOrAbove(user);
    await this.prisma.station.delete({ where: { id } });
    return { success: true };
  }

  private listWhere(user: AuthenticatedUser, status?: StationStatus): Prisma.StationWhereInput {
    const statusFilter = status ? { status } : {};
    if (user.role === UserRole.DRIVER || user.role === UserRole.SUPER_ADMIN) {
      return statusFilter;
    }
    return {
      companyId: { in: user.companyIds },
      ...statusFilter,
    };
  }

  private async resolveVehicleTypes(
    vehicleId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<string[] | null> {
    if (!vehicleId) return null;
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundError("Vehicle", vehicleId);
    if (user.role === UserRole.DRIVER && vehicle.userId !== user.id) {
      throw new ForbiddenError("Cannot use another user's vehicle");
    }
    return vehicle.connectorTypes;
  }

  private matchesDiscoveryFilters(
    station: StationRecord,
    filters: {
      connectorType?: ConnectorType;
      powerMin?: number;
      maxPrice?: number;
      availableNow: boolean;
      currentType?: "AC" | "DC";
      vehicleTypes: string[] | null;
    },
  ): boolean {
    const connectors = station.chargers.flatMap((charger) =>
      charger.connectors.map((connector) => ({ charger, connector })),
    );
    const tariff = this.tariffForStation(station);

    if (filters.maxPrice !== undefined) {
      if (!tariff || tariff.pricePerKwhCents > maxPriceToCents(filters.maxPrice)) {
        return false;
      }
    }

    const matching = connectors.filter(({ charger, connector }) => {
      if (filters.connectorType && connector.type !== filters.connectorType) return false;
      if (filters.powerMin !== undefined && Number(connector.maxPowerKw) < filters.powerMin) {
        return false;
      }
      if (filters.currentType && !connectorMatchesCurrentType(connector.type, filters.currentType)) {
        return false;
      }
      if (
        filters.vehicleTypes &&
        !isVehicleCompatibleWithConnector(filters.vehicleTypes, connector.type)
      ) {
        return false;
      }
      if (filters.availableNow) {
        if (station.status !== StationStatus.ACTIVE) return false;
        if (OFFLINE_CHARGER_STATUSES.has(charger.status)) return false;
        if (connector.status !== ConnectorStatus.AVAILABLE) return false;
      }
      return true;
    });

    if (
      filters.connectorType ||
      filters.powerMin ||
      filters.currentType ||
      filters.vehicleTypes ||
      filters.availableNow
    ) {
      return matching.length > 0;
    }

    return true;
  }

  private toDiscoveryCard(
    station: StationRecord,
    distanceKm: number,
    vehicleTypes: string[] | null,
  ) {
    const summary = this.summarize(station, vehicleTypes);
    return {
      id: station.id,
      name: station.name,
      address: station.address,
      city: station.city,
      postalCode: station.postalCode,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      distanceKm: Number(distanceKm.toFixed(2)),
      status: station.status,
      accessType: station.accessType,
      amenities: station.amenities,
      openingHoursLabel: openingHoursLabel(station.openingHours),
      chargerCount: station.chargers.length,
      availableConnectors: summary.availableConnectors,
      occupiedConnectors: summary.occupiedConnectors,
      reservedConnectors: summary.reservedConnectors,
      offlineConnectors: summary.offlineConnectors,
      faultedConnectors: summary.faultedConnectors,
      totalConnectors: summary.totalConnectors,
      crowded: summary.totalConnectors > 0 && summary.availableConnectors === 0,
      currentType: summary.currentType,
      maxPowerKw: summary.maxPowerKw,
      pricePerKwhCents: summary.pricePerKwhCents,
      currency: summary.currency,
      compatible: summary.compatible,
      lastSeenAt: summary.lastSeenAt,
      updatedAt: station.updatedAt,
      reliability: {
        lastCommunicationAt: summary.lastSeenAt,
        lastUpdatedAt: station.updatedAt,
        availabilityPercent: null,
      },
    };
  }

  private enrichStation(station: StationRecord, vehicleTypes: string[] | null = null) {
    const summary = this.summarize(station, vehicleTypes);
    return {
      id: station.id,
      companyId: station.companyId,
      name: station.name,
      address: station.address,
      city: station.city,
      postalCode: station.postalCode,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      status: station.status,
      accessType: station.accessType,
      amenities: station.amenities,
      openingHours: station.openingHours,
      openingHoursLabel: openingHoursLabel(station.openingHours),
      createdAt: station.createdAt,
      updatedAt: station.updatedAt,
      lastSeenAt: summary.lastSeenAt,
      currentType: summary.currentType,
      maxPowerKw: summary.maxPowerKw,
      pricePerKwhCents: summary.pricePerKwhCents,
      currency: summary.currency,
      connectionFeeCents: this.tariffForStation(station)?.connectionFeeCents ?? 0,
      idleFeeCents: this.tariffForStation(station)?.idleFeeCents ?? 0,
      tariffId: station.tariffId,
      compatible: summary.compatible,
      crowded: summary.totalConnectors > 0 && summary.availableConnectors === 0,
      reliability: {
        lastCommunicationAt: summary.lastSeenAt,
        lastUpdatedAt: station.updatedAt,
        availabilityPercent: null,
      },
      availability: {
        totalConnectors: summary.totalConnectors,
        availableConnectors: summary.availableConnectors,
        occupiedConnectors: summary.occupiedConnectors,
        reservedConnectors: summary.reservedConnectors,
        offlineConnectors: summary.offlineConnectors,
        faultedConnectors: summary.faultedConnectors,
      },
      chargers: station.chargers.map((charger) => ({
        id: charger.id,
        stationId: charger.stationId,
        serialNumber: charger.serialNumber,
        model: charger.model,
        maxPowerKw: Number(charger.maxPowerKw),
        status: charger.status,
        lastSeenAt: charger.lastSeenAt,
        connectors: charger.connectors.map((connector) => {
          const compatible =
            vehicleTypes === null
              ? null
              : isVehicleCompatibleWithConnector(vehicleTypes, connector.type);
          return {
            id: connector.id,
            chargerId: connector.chargerId,
            number: connector.number,
            type: connector.type,
            maxPowerKw: Number(connector.maxPowerKw),
            status: connector.status,
            assignedTariffId: connector.tariffId,
            compatible,
            ...this.connectorTariffView(station, connector),
            action: this.connectorAction(
              station.status,
              charger.status,
              connector.status,
              compatible,
            ),
          };
        }),
      })),
    };
  }

  private summarize(station: StationRecord, vehicleTypes: string[] | null) {
    const connectors = station.chargers.flatMap((charger) => charger.connectors);
    const totalConnectors = connectors.length;
    const availableConnectors = connectors.filter(
      (connector) => connector.status === ConnectorStatus.AVAILABLE,
    ).length;
    const occupiedConnectors = connectors.filter((connector) =>
      OCCUPIED_STATUSES.includes(connector.status),
    ).length;
    const reservedConnectors = connectors.filter(
      (connector) => connector.status === ConnectorStatus.RESERVED,
    ).length;
    const faultedConnectors = connectors.filter(
      (connector) => connector.status === ConnectorStatus.FAULTED,
    ).length;
    const offlineConnectors = station.chargers.reduce((count, charger) => {
      if (!OFFLINE_CHARGER_STATUSES.has(charger.status)) return count;
      return count + charger.connectors.length;
    }, 0);
    const types = connectors.map((connector) => connector.type);
    const lastSeenAt = station.chargers.reduce<Date | null>((latest, charger) => {
      if (!charger.lastSeenAt) return latest;
      if (!latest || charger.lastSeenAt > latest) return charger.lastSeenAt;
      return latest;
    }, null);
    const tariff = this.tariffForStation(station);
    const compatible =
      vehicleTypes === null
        ? null
        : connectors.some((connector) =>
            isVehicleCompatibleWithConnector(vehicleTypes, connector.type),
          );

    return {
      totalConnectors,
      availableConnectors,
      occupiedConnectors,
      reservedConnectors,
      faultedConnectors,
      offlineConnectors,
      currentType: stationCurrentType(types),
      maxPowerKw: station.chargers.reduce(
        (max, charger) => Math.max(max, Number(charger.maxPowerKw)),
        0,
      ),
      pricePerKwhCents: tariff?.pricePerKwhCents ?? null,
      currency: tariff?.currency ?? "BRL",
      lastSeenAt,
      compatible,
    };
  }

  private connectorAction(
    stationStatus: StationStatus,
    chargerStatus: string,
    connectorStatus: ConnectorStatus,
    compatible: boolean | null,
  ): "CHARGE" | "INCOMPATIBLE" | "OCCUPIED" | "UNAVAILABLE" {
    if (stationStatus !== StationStatus.ACTIVE) return "UNAVAILABLE";
    if (OFFLINE_CHARGER_STATUSES.has(chargerStatus)) return "UNAVAILABLE";
    if (connectorStatus === ConnectorStatus.FAULTED || connectorStatus === ConnectorStatus.UNAVAILABLE) {
      return "UNAVAILABLE";
    }
    if (compatible === false) return "INCOMPATIBLE";
    if (OCCUPIED_STATUSES.includes(connectorStatus)) return "OCCUPIED";
    if (connectorStatus === ConnectorStatus.AVAILABLE) return "CHARGE";
    return "UNAVAILABLE";
  }

  private resolveCompanyId(user: AuthenticatedUser): string {
    if (!user.companyIds.length) {
      throw new ForbiddenError("User has no company membership");
    }
    return user.companyIds[0]!;
  }

  private asTariffLike(tariff: NonNullable<StationRecord["tariff"]>): TariffLike {
    return tariff;
  }

  private tariffForConnector(
    station: StationRecord,
    connector: StationRecord["chargers"][number]["connectors"][number],
  ): TariffLike | null {
    return pickEffectiveTariff({
      connectorTariff: connector.tariff ? this.asTariffLike(connector.tariff) : null,
      stationTariff: station.tariff ? this.asTariffLike(station.tariff) : null,
      companyTariffs: station.company.tariffs.map((item) => this.asTariffLike(item)),
    });
  }

  private tariffForStation(station: StationRecord): TariffLike | null {
    const firstConnector = station.chargers[0]?.connectors[0];
    if (firstConnector) return this.tariffForConnector(station, firstConnector);
    return pickEffectiveTariff({
      stationTariff: station.tariff ? this.asTariffLike(station.tariff) : null,
      companyTariffs: station.company.tariffs.map((item) => this.asTariffLike(item)),
    });
  }

  private connectorTariffView(
    station: StationRecord,
    connector: StationRecord["chargers"][number]["connectors"][number],
  ) {
    const tariff = this.tariffForConnector(station, connector);
    return {
      tariffId: tariff?.id ?? null,
      pricePerKwhCents: tariff?.pricePerKwhCents ?? null,
      pricePerMinuteCents: tariff?.pricePerMinuteCents ?? 0,
      idleFeeCents: tariff?.idleFeeCents ?? 0,
      connectionFeeCents: tariff?.connectionFeeCents ?? 0,
      currency: tariff?.currency ?? "BRL",
    };
  }

  private async assertCompanyTariff(tariffId: string, companyId: string) {
    const tariff = await this.prisma.tariff.findUnique({ where: { id: tariffId } });
    if (!tariff) throw new NotFoundError("Tariff", tariffId);
    if (tariff.companyId !== companyId) {
      throw new ValidationError("Tarifa não pertence a esta empresa");
    }
  }
}

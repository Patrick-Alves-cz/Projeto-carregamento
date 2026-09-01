import { Injectable } from "@nestjs/common";
import { ConnectorStatus, UserRole } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@evcharge/domain";
import type {
  CreateStationInput,
  UpdateStationInput,
  ListStationsQuery,
} from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { haversineDistanceKm } from "../common/utils/geo.util";
import { AuthenticatedUser } from "../common/types/auth.types";

const stationInclude = {
  chargers: {
    include: { connectors: true },
  },
} as const;

@Injectable()
export class StationsService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
  ) {}

  async findAll(query: ListStationsQuery, user: AuthenticatedUser) {
    const where =
      user.role === UserRole.DRIVER || user.role === UserRole.SUPER_ADMIN
        ? { ...(query.status ? { status: query.status } : {}) }
        : {
            companyId: { in: user.companyIds },
            ...(query.status ? { status: query.status } : {}),
          };

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
        s.chargers.some((c) =>
          c.connectors.some((conn) => conn.type === query.connectorType),
        ),
      );
    }

    return stations.map((s) => this.enrichStation(s));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const station = await this.prisma.station.findUnique({
      where: { id },
      include: stationInclude,
    });
    if (!station) throw new NotFoundError("Station", id);

    if (user.role !== UserRole.DRIVER && user.role !== UserRole.SUPER_ADMIN) {
      this.tenantAccess.assertCompanyAccess(user, station.companyId);
    }

    return this.enrichStation(station);
  }

  async create(input: CreateStationInput, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const companyId = this.resolveCompanyId(user);
    this.tenantAccess.assertCompanyAccess(user, companyId);

    const station = await this.prisma.station.create({
      data: {
        ...input,
        companyId,
        latitude: input.latitude,
        longitude: input.longitude,
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

    const updated = await this.prisma.station.update({
      where: { id },
      data: input,
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

  private resolveCompanyId(user: AuthenticatedUser): string {
    if (!user.companyIds.length) {
      throw new ForbiddenError("User has no company membership");
    }
    return user.companyIds[0]!;
  }

  private enrichStation(station: {
    id: string;
    companyId: string;
    name: string;
    address: string;
    latitude: unknown;
    longitude: unknown;
    status: string;
    amenities: string[];
    chargers: {
      id: string;
      status: string;
      maxPowerKw: unknown;
      connectors: { status: ConnectorStatus; maxPowerKw: unknown }[];
    }[];
  }) {
    const totalConnectors = station.chargers.reduce((acc, c) => acc + c.connectors.length, 0);
    const availableConnectors = station.chargers.reduce(
      (acc, c) =>
        acc + c.connectors.filter((conn) => conn.status === ConnectorStatus.AVAILABLE).length,
      0,
    );

    return {
      ...station,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
      availability: {
        totalConnectors,
        availableConnectors,
        occupiedConnectors: totalConnectors - availableConnectors,
      },
      chargers: station.chargers.map((c) => ({
        ...c,
        maxPowerKw: Number(c.maxPowerKw),
        connectors: c.connectors.map((conn) => ({
          ...conn,
          maxPowerKw: Number(conn.maxPowerKw),
        })),
      })),
    };
  }
}

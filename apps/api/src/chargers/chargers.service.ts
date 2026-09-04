import { Injectable, Optional } from "@nestjs/common";
import { UserRole, ChargerStatus } from "@prisma/client";
import { ConflictError, ForbiddenError, NotFoundError, assertChargerStatusTransition } from "@evcharge/domain";
import type { CreateChargerInput, UpdateChargerInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ChargerProviderService } from "../charging/charger-provider.service";
import { OcppConnectionManager } from "../ocpp/ocpp-connection.manager";

@Injectable()
export class ChargersService {
  constructor(
    private prisma: PrismaService,
    private tenantAccess: TenantAccessService,
    private chargerProvider: ChargerProviderService,
    @Optional() private readonly connections?: OcppConnectionManager,
  ) {}

  async findAll(stationId: string | undefined, user: AuthenticatedUser) {
    this.assertAdminSurface(user);
    const stations = await this.getAccessibleStationIds(user, stationId);
    const chargers = await this.prisma.charger.findMany({
      where: { stationId: { in: stations } },
      include: { connectors: true, station: true },
      orderBy: { createdAt: "desc" },
    });
    return chargers.map((charger) => this.withOcppOverlay(charger));
  }

  async findOne(id: string, user: AuthenticatedUser) {
    this.assertAdminSurface(user);
    const charger = await this.prisma.charger.findUnique({
      where: { id },
      include: { connectors: true, station: true },
    });
    if (!charger) throw new NotFoundError("Charger", id);
    if (!this.tenantAccess.isSuperAdmin(user)) {
      this.tenantAccess.assertCompanyAccess(user, charger.station.companyId);
    }
    return this.withOcppOverlay(charger);
  }

  async create(input: CreateChargerInput, user: AuthenticatedUser) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const station = await this.prisma.station.findUnique({
      where: { id: input.stationId },
    });
    if (!station) throw new NotFoundError("Station", input.stationId);
    this.tenantAccess.assertCompanyAccess(user, station.companyId);

    const providerId = input.providerId ?? "mock";
    const ocpp = this.chargerProvider.usesOcpp(providerId);
    try {
      const charger = await this.prisma.charger.create({
        data: {
          stationId: input.stationId,
          serialNumber: input.serialNumber,
          identity: input.identity ?? input.serialNumber,
          model: input.model,
          vendor: input.vendor,
          maxPowerKw: input.maxPowerKw,
          providerId,
          protocol: ocpp ? "ocpp1.6" : null,
          status: ocpp ? ChargerStatus.OFFLINE : ChargerStatus.AVAILABLE,
          lastSeenAt: ocpp ? null : new Date(),
        },
        include: { connectors: true },
      });
      await this.chargerProvider.syncCharger(charger.id);
      return charger;
    } catch {
      throw new ConflictError("Charger serial number already exists");
    }
  }

  async update(id: string, input: UpdateChargerInput, user: AuthenticatedUser) {
    const charger = await this.prisma.charger.findUnique({
      where: { id },
      include: { station: true },
    });
    if (!charger) throw new NotFoundError("Charger", id);
    this.tenantAccess.assertCompanyAccess(user, charger.station.companyId);
    this.tenantAccess.assertOperatorOrAbove(user);

    if (input.status && input.status !== charger.status) {
      assertChargerStatusTransition(charger.status, input.status);
    }

    const updated = await this.prisma.charger.update({
      where: { id },
      data: input,
      include: { connectors: true },
    });
    await this.chargerProvider.syncCharger(updated.id);
    return updated;
  }

  private withOcppOverlay<
    T extends {
      id: string;
      status: string;
      lastSeenAt: Date | null;
      protocol: string | null;
      providerId: string | null;
    },
  >(charger: T) {
    const conn = this.connections?.get(charger.id);
    const ocpp = this.chargerProvider.usesOcpp(charger.providerId);
    return {
      ...charger,
      protocolLabel: ocpp ? "OCPP 1.6" : charger.protocol ?? "mock",
      ocppOnline: ocpp ? Boolean(this.connections?.isOnline(charger.id)) : charger.status !== "OFFLINE",
      ocppConnectedAt: conn?.connectedAt ?? null,
      lastSeenAt: conn?.lastMessageAt ?? charger.lastSeenAt,
    };
  }

  private assertAdminSurface(user: AuthenticatedUser) {
    if (user.role === UserRole.DRIVER) {
      throw new ForbiddenError("Motoristas acessam carregadores pela estação");
    }
  }

  private async getAccessibleStationIds(
    user: AuthenticatedUser,
    stationId?: string,
  ): Promise<string[]> {
    if (stationId) {
      const station = await this.prisma.station.findUnique({ where: { id: stationId } });
      if (!station) throw new NotFoundError("Station", stationId);
      if (!this.tenantAccess.isSuperAdmin(user)) {
        this.tenantAccess.assertCompanyAccess(user, station.companyId);
      }
      return [stationId];
    }

    if (this.tenantAccess.isSuperAdmin(user)) {
      const all = await this.prisma.station.findMany({ select: { id: true } });
      return all.map((s) => s.id);
    }

    const stations = await this.prisma.station.findMany({
      where: { companyId: { in: user.companyIds } },
      select: { id: true },
    });
    return stations.map((s) => s.id);
  }
}

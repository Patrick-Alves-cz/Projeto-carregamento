import { Injectable } from "@nestjs/common";
import { ForbiddenError, NotFoundError } from "@evcharge/domain";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { AuthenticatedUser } from "../common/types/auth.types";

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthenticatedUser) {
    this.assertDriver(user);
    return this.prisma.favoriteStation.findMany({
      where: { userId: user.id },
      include: { station: true, connector: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async add(user: AuthenticatedUser, stationId: string, connectorId?: string) {
    this.assertDriver(user);
    const station = await this.prisma.station.findUnique({ where: { id: stationId } });
    if (!station) throw new NotFoundError("Station", stationId);
    return this.prisma.favoriteStation.upsert({
      where: { userId_stationId: { userId: user.id, stationId } },
      update: { connectorId: connectorId ?? null },
      create: { userId: user.id, stationId, connectorId: connectorId ?? null },
    });
  }

  async remove(user: AuthenticatedUser, stationId: string) {
    this.assertDriver(user);
    await this.prisma.favoriteStation.deleteMany({ where: { userId: user.id, stationId } });
    return { stationId, deleted: true };
  }

  private assertDriver(user: AuthenticatedUser) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenError("Somente motoristas");
  }
}

import { Injectable } from "@nestjs/common";
import { ForbiddenError, NotFoundError } from "@evcharge/domain";
import type { CreateVehicleInput, UpdateVehicleInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { AuthenticatedUser } from "../common/types/auth.types";

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser) {
    return this.prisma.vehicle.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);
    return vehicle;
  }

  async create(input: CreateVehicleInput, user: AuthenticatedUser) {
    return this.prisma.vehicle.create({
      data: { ...input, userId: user.id },
    });
  }

  async update(id: string, input: UpdateVehicleInput, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);
    return this.prisma.vehicle.update({ where: { id }, data: input });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);
    await this.prisma.vehicle.delete({ where: { id } });
    return { success: true };
  }

  private assertOwner(user: AuthenticatedUser, ownerId: string) {
    if (user.id !== ownerId) throw new ForbiddenError("Cannot access another user's vehicle");
  }
}

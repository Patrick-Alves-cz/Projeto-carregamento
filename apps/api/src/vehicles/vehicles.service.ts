import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@evcharge/domain";
import type { CreateVehicleInput, UpdateVehicleInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { AuthenticatedUser } from "../common/types/auth.types";

function serializeVehicle(vehicle: {
  id: string;
  userId: string;
  brand: string;
  model: string;
  year: number | null;
  batteryKwh: Prisma.Decimal | null;
  connectorTypes: string[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...vehicle,
    batteryKwh: vehicle.batteryKwh === null ? null : Number(vehicle.batteryKwh),
  };
}

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser) {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return vehicles.map(serializeVehicle);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);
    return serializeVehicle(vehicle);
  }

  async create(input: CreateVehicleInput, user: AuthenticatedUser) {
    const count = await this.prisma.vehicle.count({ where: { userId: user.id } });
    const isDefault = input.isDefault === true || count === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.vehicle.updateMany({
          where: { userId: user.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      const vehicle = await tx.vehicle.create({
        data: {
          userId: user.id,
          brand: input.brand,
          model: input.model,
          year: input.year,
          batteryKwh: input.batteryKwh,
          connectorTypes: input.connectorTypes,
          isDefault,
        },
      });
      return serializeVehicle(vehicle);
    });
  }

  async update(id: string, input: UpdateVehicleInput, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);

    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault === true) {
        await tx.vehicle.updateMany({
          where: { userId: user.id, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updated = await tx.vehicle.update({
        where: { id },
        data: {
          brand: input.brand,
          model: input.model,
          year: input.year,
          batteryKwh: input.batteryKwh,
          connectorTypes: input.connectorTypes,
          isDefault: input.isDefault,
        },
      });
      return serializeVehicle(updated);
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundError("Vehicle", id);
    this.assertOwner(user, vehicle.userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicle.delete({ where: { id } });
      if (vehicle.isDefault) {
        const next = await tx.vehicle.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "asc" },
        });
        if (next) {
          await tx.vehicle.update({ where: { id: next.id }, data: { isDefault: true } });
        }
      }
    });
    return { success: true };
  }

  private assertOwner(user: AuthenticatedUser, ownerId: string) {
    if (user.id !== ownerId) throw new ForbiddenError("Cannot access another user's vehicle");
  }
}

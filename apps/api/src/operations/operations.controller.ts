import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ChargerCommandType, UserRole } from "@prisma/client";
import { changeAvailabilitySchema } from "@evcharge/shared";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { OperationsService } from "./operations.service";
import { ChargerCommandsService } from "../ocpp/charger-commands.service";
import { ReconciliationCasesService } from "./reconciliation-cases.service";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { PrismaService } from "../common/database/database.module";
import { NotFoundError } from "@evcharge/domain";

@ApiTags("operations")
@ApiBearerAuth()
@Controller("operations")
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly recon: ReconciliationCasesService,
    private readonly tenant: TenantAccessService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Get("summary")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.operations.summary(user);
  }

  @Get("chargers/:id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  charger(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.operations.chargerTimeline(user, id);
  }

  @Post("chargers/:id/availability")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async availability(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(changeAvailabilitySchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = body as { connectorId?: string; availability: "Inoperative" | "Operative"; confirm: true };
    const charger = await this.prisma.charger.findUnique({
      where: { id },
      include: { station: true, connectors: true },
    });
    if (!charger) throw new NotFoundError("Charger", id);
    this.tenant.assertCompanyAccess(user, charger.station.companyId);
    return this.moduleRef.get(ChargerCommandsService, { strict: false }).execute({
      chargerId: id,
      type: ChargerCommandType.CHANGE_AVAILABILITY,
      connectorId: input.connectorId,
      availability: input.availability,
      userId: user.id,
      confirm: true,
    });
  }

  @Get("reconciliation")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reconciliation(@CurrentUser() user: AuthenticatedUser) {
    return this.recon.list(user);
  }

  @Get("kpis")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  kpis(@CurrentUser() user: AuthenticatedUser, @Query("stationId") _stationId?: string) {
    return this.operations.summary(user);
  }
}

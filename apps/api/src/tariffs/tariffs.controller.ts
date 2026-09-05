import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { createTariffSchema, updateTariffSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { TariffsService } from "./tariffs.service";

@ApiTags("tariffs")
@ApiBearerAuth()
@Controller("tariffs")
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List company tariffs" })
  list(@CurrentUser() user: AuthenticatedUser, @Query("companyId") companyId?: string) {
    return this.tariffsService.list(user, companyId);
  }

  @Get("quote")
  @Roles(UserRole.DRIVER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Estimate session cost from the frozen tariff snapshot rules" })
  quote(
    @Query("connectorId") connectorId: string,
    @Query("energyKwh") energyKwh?: string,
    @Query("durationMinutes") durationMinutes?: string,
  ) {
    return this.tariffsService.quote(
      connectorId,
      Number(energyKwh ?? 10),
      Number(durationMinutes ?? 30),
    );
  }

  @Get(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get tariff by id" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tariffsService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a tariff. Negative prices are rejected." })
  create(
    @Body(new ZodValidationPipe(createTariffSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tariffsService.create(body as Parameters<TariffsService["create"]>[0], user);
  }

  @Patch(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update a tariff. Existing session snapshots stay unchanged." })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTariffSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tariffsService.update(id, body as Parameters<TariffsService["update"]>[1], user);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Delete a tariff, or deactivate it when referenced by sessions",
  })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tariffsService.remove(id, user);
  }
}

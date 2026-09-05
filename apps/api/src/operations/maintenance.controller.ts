import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { createMaintenanceSchema } from "@evcharge/shared";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { MaintenanceService } from "./maintenance.service";
import type { CreateMaintenanceInput } from "@evcharge/shared";

@ApiTags("maintenance")
@ApiBearerAuth()
@Controller("maintenance")
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.list(user);
  }

  @Post()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(
    @Body(new ZodValidationPipe(createMaintenanceSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.maintenance.create(user, body as CreateMaintenanceInput);
  }

  @Post(":id/cancel")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  cancel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.maintenance.cancel(user, id);
  }
}

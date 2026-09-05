import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { IncidentSeverity, IncidentStatus, UserRole } from "@prisma/client";
import { resolveIncidentSchema } from "@evcharge/shared";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { IncidentsService } from "./incidents.service";

@ApiTags("incidents")
@ApiBearerAuth()
@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("status") status?: IncidentStatus,
    @Query("severity") severity?: IncidentSeverity,
    @Query("stationId") stationId?: string,
    @Query("chargerId") chargerId?: string,
  ) {
    return this.incidents.list(user, { status, severity, stationId, chargerId });
  }

  @Get(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidents.get(user, id);
  }

  @Post(":id/acknowledge")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  acknowledge(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.incidents.acknowledge(user, id);
  }

  @Patch(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  resolve(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveIncidentSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.incidents.resolve(user, id, body as { resolution: string; status: "RESOLVED" | "IGNORED" });
  }
}

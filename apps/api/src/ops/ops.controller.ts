import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/auth.types";
import { OpsService } from "./ops.service";

@ApiTags("ops")
@ApiBearerAuth()
@Controller("ops")
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get("summary")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Operational dashboard totals from live data" })
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.opsService.summary(user);
  }

  @Get("payments")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Demo session payments for the operator company" })
  payments(@CurrentUser() user: AuthenticatedUser) {
    return this.opsService.payments(user);
  }
}

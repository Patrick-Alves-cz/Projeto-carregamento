import { Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { AuthenticatedUser } from "../common/types/auth.types";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiBearerAuth()
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles(UserRole.DRIVER, UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List in-app notifications for the current user" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.listForUser(user.id);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  markRead(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markRead(id, user.id);
  }
}

import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { joinWaitlistSchema, type JoinWaitlistInput } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { WaitlistService } from "./waitlist.service";

@ApiTags("waitlist")
@ApiBearerAuth()
@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Post()
  @Roles(UserRole.DRIVER)
  join(
    @Body(new ZodValidationPipe(joinWaitlistSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.waitlist.join(user, body as JoinWaitlistInput);
  }

  @Get("me")
  @Roles(UserRole.DRIVER)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.waitlist.mine(user);
  }

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.waitlist.listAdmin(user);
  }

  @Post(":id/claim")
  @Roles(UserRole.DRIVER)
  claim(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlist.claim(user, id);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.waitlist.cancel(user, id);
  }
}

import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { UserRole } from "@prisma/client";
import { acceptInvitationSchema, createInvitationSchema } from "@evcharge/shared";
import { Public, Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { InvitationsService } from "./invitations.service";

@ApiTags("invitations")
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get()
  @ApiBearerAuth()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List company members and invitations" })
  list(@CurrentUser() user: AuthenticatedUser, @Query("companyId") companyId?: string) {
    return this.invitationsService.list(user, companyId);
  }

  @Post()
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Create an OPERATOR or ADMIN invitation",
    description: "Public DRIVER registration stays closed. DEMO responses include the accept token once.",
  })
  create(
    @Body(new ZodValidationPipe(createInvitationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitationsService.create(
      body as Parameters<InvitationsService["create"]>[0],
      user,
    );
  }

  @Public()
  @Get(":token")
  @ApiOperation({ summary: "Preview an invitation by token (no secrets besides role/email)" })
  preview(@Param("token") token: string) {
    return this.invitationsService.preview(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post(":token/accept")
  @ApiOperation({ summary: "Accept an invitation and create the operator/admin account" })
  accept(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(acceptInvitationSchema)) body: unknown,
  ) {
    return this.invitationsService.accept(
      token,
      body as Parameters<InvitationsService["accept"]>[1],
    );
  }

  @Post(":id/revoke")
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Revoke a pending invitation",
    description: "Accepts invitation id or the DEMO accept token.",
  })
  revoke(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invitationsService.revoke(id, user);
  }
}

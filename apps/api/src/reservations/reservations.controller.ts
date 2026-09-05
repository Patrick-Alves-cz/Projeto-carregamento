import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { createReservationSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ReservationsService } from "./reservations.service";

@ApiTags("reservations")
@ApiBearerAuth()
@Controller("reservations")
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  @Roles(UserRole.DRIVER)
  create(
    @Body(new ZodValidationPipe(createReservationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reservations.create(user, body as Parameters<ReservationsService["create"]>[1]);
  }

  @Get("me")
  @Roles(UserRole.DRIVER)
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.reservations.mine(user);
  }

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.reservations.listAdmin(user);
  }

  @Post(":id/cancel")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.reservations.cancel(user, id);
  }
}

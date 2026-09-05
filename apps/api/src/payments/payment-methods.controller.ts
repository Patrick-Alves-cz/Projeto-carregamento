import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { createPaymentMethodSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { PaymentMethodsService } from "./payment-methods.service";

@ApiTags("payment-methods")
@ApiBearerAuth()
@Controller("payment-methods")
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Get("admin")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listAdmin(@CurrentUser() user: AuthenticatedUser) {
    return this.methods.listAdmin(user);
  }

  @Get()
  @Roles(UserRole.DRIVER)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.methods.list(user);
  }

  @Post()
  @Roles(UserRole.DRIVER)
  create(
    @Body(new ZodValidationPipe(createPaymentMethodSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.methods.create(user, body as Parameters<PaymentMethodsService["create"]>[1]);
  }

  @Patch(":id/default")
  @Roles(UserRole.DRIVER)
  setDefault(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.methods.setDefault(user, id);
  }

  @Delete(":id")
  @Roles(UserRole.DRIVER)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.methods.remove(user, id);
  }
}

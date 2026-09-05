import { Controller, Get } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { AuthenticatedUser } from "../common/types/auth.types";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@ApiTags("finance")
@ApiBearerAuth()
@Controller("finance/reconciliation")
export class FinanceReconciliationController {
  constructor(private readonly recon: PaymentReconciliationService) {}

  @Get()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.recon.list(user);
  }
}

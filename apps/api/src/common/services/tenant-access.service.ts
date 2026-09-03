import { Injectable, Logger } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ForbiddenError, TenantIsolationError } from "@evcharge/domain";
import { AuthenticatedUser } from "../types/auth.types";
import { AuditLogger } from "../logging/audit-logger";

@Injectable()
export class TenantAccessService {
  private readonly audit = new AuditLogger(new Logger(TenantAccessService.name));

  isSuperAdmin(user: AuthenticatedUser): boolean {
    return user.role === UserRole.SUPER_ADMIN;
  }

  assertSuperAdmin(user: AuthenticatedUser): void {
    if (!this.isSuperAdmin(user)) {
      this.audit.warn("authorization.denied", { userId: user.id, action: "super_admin" });
      throw new ForbiddenError();
    }
  }

  assertCompanyAccess(user: AuthenticatedUser, companyId: string): void {
    if (this.isSuperAdmin(user)) return;
    if (!user.companyIds.includes(companyId)) {
      this.audit.warn("authorization.denied", {
        userId: user.id,
        action: "company_access",
        companyId,
      });
      throw new TenantIsolationError();
    }
  }

  assertOperatorOrAbove(user: AuthenticatedUser): void {
    const allowed: UserRole[] = [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!allowed.includes(user.role)) {
      this.audit.warn("authorization.denied", { userId: user.id, action: "operator_or_above" });
      throw new ForbiddenError();
    }
  }

  assertAdminOrAbove(user: AuthenticatedUser): void {
    const allowed: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!allowed.includes(user.role)) {
      this.audit.warn("authorization.denied", { userId: user.id, action: "admin_or_above" });
      throw new ForbiddenError();
    }
  }

  assertSelfOrOperator(user: AuthenticatedUser, targetUserId: string): void {
    if (user.id === targetUserId) return;
    this.assertOperatorOrAbove(user);
  }
}

import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ForbiddenError, TenantIsolationError } from "@evcharge/domain";
import { AuthenticatedUser } from "../types/auth.types";

@Injectable()
export class TenantAccessService {
  isSuperAdmin(user: AuthenticatedUser): boolean {
    return user.role === UserRole.SUPER_ADMIN;
  }

  assertSuperAdmin(user: AuthenticatedUser): void {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError();
    }
  }

  assertCompanyAccess(user: AuthenticatedUser, companyId: string): void {
    if (this.isSuperAdmin(user)) return;
    if (!user.companyIds.includes(companyId)) {
      throw new TenantIsolationError();
    }
  }

  assertOperatorOrAbove(user: AuthenticatedUser): void {
    const allowed: UserRole[] = [UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  assertAdminOrAbove(user: AuthenticatedUser): void {
    const allowed: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];
    if (!allowed.includes(user.role)) {
      throw new ForbiddenError();
    }
  }

  assertSelfOrOperator(user: AuthenticatedUser, targetUserId: string): void {
    if (user.id === targetUserId) return;
    this.assertOperatorOrAbove(user);
  }
}

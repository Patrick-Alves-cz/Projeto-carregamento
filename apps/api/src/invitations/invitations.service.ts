import { Injectable, Logger } from "@nestjs/common";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@evcharge/domain";
import type { AcceptInvitationInput, CreateInvitationInput } from "@evcharge/shared";
import {
  CompanyMemberRole,
  InvitationStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { AuthService } from "../auth/auth.service";
import { isDemoEnvironment } from "../common/config/demo";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { AuthenticatedUser } from "../common/types/auth.types";
import { generateRefreshToken, hashToken } from "../common/utils/token.util";

function memberRoleFor(role: UserRole): CompanyMemberRole {
  return role === UserRole.ADMIN ? CompanyMemberRole.ADMIN : CompanyMemberRole.OPERATOR;
}

@Injectable()
export class InvitationsService {
  private readonly bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  private readonly audit = new AuditLogger(new Logger(InvitationsService.name));

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly authService: AuthService,
  ) {}

  async list(user: AuthenticatedUser, companyId?: string) {
    this.tenantAccess.assertOperatorOrAbove(user);
    const scopeCompanyId = this.resolveCompanyId(user, companyId);
    const [members, invitations] = await Promise.all([
      this.prisma.companyMember.findMany({
        where: { companyId: scopeCompanyId },
        include: { user: { include: { profile: true } } },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.invitation.findMany({
        where: { companyId: scopeCompanyId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    await this.expirePending(scopeCompanyId);

    return {
      members: members.map((member) => ({
        id: member.id,
        userId: member.userId,
        email: member.user.email,
        fullName: member.user.profile?.fullName ?? member.user.email,
        role: member.user.role,
        memberRole: member.role,
        status: member.user.status,
      })),
      invitations: invitations.map((invite) => this.publicInvite(invite)),
    };
  }

  async create(input: CreateInvitationInput, user: AuthenticatedUser) {
    this.tenantAccess.assertAdminOrAbove(user);
    this.tenantAccess.assertCompanyAccess(user, input.companyId);
    if ((input.role as string) === UserRole.SUPER_ADMIN || (input.role as string) === UserRole.DRIVER) {
      throw new ForbiddenError("Não é permitido convidar SUPER_ADMIN ou DRIVER");
    }

    const email = input.email.toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { companyMembers: true },
    });
    if (existingUser?.companyMembers.some((member) => member.companyId === input.companyId)) {
      throw new ConflictError("Este e-mail já pertence à equipe");
    }

    const pending = await this.prisma.invitation.findFirst({
      where: {
        email,
        companyId: input.companyId,
        status: InvitationStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
    });
    if (pending) throw new ConflictError("Já existe um convite pendente para este e-mail");

    const token = generateRefreshToken();
    const invite = await this.prisma.invitation.create({
      data: {
        email,
        companyId: input.companyId,
        role: input.role,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: user.id,
        status: InvitationStatus.PENDING,
      },
    });

    this.audit.info("invitation.created", {
      invitationId: invite.id,
      companyId: input.companyId,
      role: input.role,
      invitedBy: user.id,
    });

    return {
      ...this.publicInvite(invite),
      token: isDemoEnvironment() ? token : undefined,
      acceptUrl: isDemoEnvironment() ? `/invite/${token}` : undefined,
    };
  }

  async preview(token: string) {
    const invite = await this.findByToken(token);
    return {
      email: invite.email,
      role: invite.role,
      companyId: invite.companyId,
      status: invite.status,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(token: string, input: AcceptInvitationInput) {
    const invite = await this.findByToken(token);
    if (invite.status !== InvitationStatus.PENDING) {
      throw new ValidationError("Este convite não está mais pendente");
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invite.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      throw new ValidationError("Convite expirado");
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existing) {
      throw new ConflictError("Este e-mail já possui conta. Peça um novo convite após ajuste interno.");
    }

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          role: invite.role,
          status: UserStatus.ACTIVE,
          profile: { create: { fullName: input.fullName } },
          companyMembers: {
            create: {
              companyId: invite.companyId,
              role: memberRoleFor(invite.role),
            },
          },
        },
      });
      await tx.invitation.update({
        where: { id: invite.id },
        data: {
          status: InvitationStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedById: user.id,
        },
      });
      return user;
    });

    this.audit.info("invitation.accepted", {
      invitationId: invite.id,
      userId: created.id,
      companyId: invite.companyId,
    });

    return this.authService.issueSessionForUser(created.id);
  }

  async revoke(idOrToken: string, user: AuthenticatedUser) {
    this.tenantAccess.assertAdminOrAbove(user);
    const invite =
      (await this.prisma.invitation.findUnique({ where: { id: idOrToken } })) ??
      (await this.prisma.invitation.findUnique({ where: { tokenHash: hashToken(idOrToken) } }));
    if (!invite) throw new NotFoundError("Invitation", idOrToken);
    this.tenantAccess.assertCompanyAccess(user, invite.companyId);
    if (invite.status !== InvitationStatus.PENDING) {
      throw new ValidationError("Somente convites pendentes podem ser revogados");
    }
    const updated = await this.prisma.invitation.update({
      where: { id: invite.id },
      data: { status: InvitationStatus.REVOKED },
    });
    this.audit.info("invitation.revoked", { invitationId: invite.id, userId: user.id });
    return this.publicInvite(updated);
  }

  private async findByToken(token: string) {
    const invite = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) throw new NotFoundError("Invitation", "token");
    if (invite.status === InvitationStatus.PENDING && invite.expiresAt < new Date()) {
      return this.prisma.invitation.update({
        where: { id: invite.id },
        data: { status: InvitationStatus.EXPIRED },
      });
    }
    return invite;
  }

  private async expirePending(companyId: string) {
    await this.prisma.invitation.updateMany({
      where: {
        companyId,
        status: InvitationStatus.PENDING,
        expiresAt: { lt: new Date() },
      },
      data: { status: InvitationStatus.EXPIRED },
    });
  }

  private resolveCompanyId(user: AuthenticatedUser, companyId?: string) {
    if (companyId) {
      this.tenantAccess.assertCompanyAccess(user, companyId);
      return companyId;
    }
    if (this.tenantAccess.isSuperAdmin(user) && user.companyIds[0]) return user.companyIds[0];
    if (!user.companyIds[0]) throw new ValidationError("Empresa não encontrada");
    return user.companyIds[0];
  }

  private publicInvite(invite: {
    id: string;
    email: string;
    companyId: string;
    role: UserRole;
    expiresAt: Date;
    status: InvitationStatus;
    invitedById: string;
    acceptedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: invite.id,
      email: invite.email,
      companyId: invite.companyId,
      role: invite.role,
      expiresAt: invite.expiresAt,
      status: invite.status,
      invitedById: invite.invitedById,
      acceptedAt: invite.acceptedAt,
      createdAt: invite.createdAt,
    };
  }
}

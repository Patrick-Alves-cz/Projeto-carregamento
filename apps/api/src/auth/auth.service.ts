import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { UserRole, UserStatus, CompanyMemberRole } from "@prisma/client";
import { ConflictError, UnauthorizedError } from "@evcharge/domain";
import type { LoginInput, RegisterInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { JwtPayload } from "../common/types/auth.types";
import { AuditLogger } from "../common/logging/audit-logger";
import {
  generateRefreshToken,
  hashToken,
  parseDurationToMs,
} from "../common/utils/token.util";
import { getJwtAccessExpiresIn } from "../common/config/jwt-secrets";

@Injectable()
export class AuthService {
  private readonly bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  private readonly refreshExpiresMs = parseDurationToMs(
    process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  );
  private readonly audit = new AuditLogger(new Logger(AuthService.name));

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictError("Email already registered");

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        role: UserRole.DRIVER,
        profile: {
          create: { fullName: input.fullName, phone: input.phone },
        },
        wallet: {
          create: { balanceCents: 10000, currency: "BRL" },
        },
      },
      include: { profile: true, companyMembers: { include: { company: true } } },
    });

    this.audit.info("auth.register.success", { userId: user.id, email: user.email, role: user.role });
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        profile: true,
        companyMembers: { include: { company: true } },
      },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      this.audit.warn("auth.login.failure", { email: input.email.toLowerCase() });
      throw new UnauthorizedError("Invalid credentials");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      this.audit.warn("auth.login.failure", { email: user.email, userId: user.id });
      throw new UnauthorizedError("Invalid credentials");
    }

    const tokens = await this.issueTokens(user);
    this.audit.info("auth.login.success", { userId: user.id, email: user.email, role: user.role });
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async refresh(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            profile: true,
            companyMembers: { include: { company: true } },
          },
        },
      },
    });

    if (!stored) {
      this.audit.warn("auth.refresh.failure", { reason: "unknown_token" });
      throw new UnauthorizedError("Invalid refresh token");
    }

    if (stored.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.securityEvent.create({
        data: {
          userId: stored.userId,
          type: "auth.refresh.reuse",
          payload: { familyId: stored.familyId },
        },
      });
      this.audit.warn("auth.refresh.reuse", {
        userId: stored.userId,
        familyId: stored.familyId,
      });
      throw new UnauthorizedError("Refresh token reuse detected");
    }

    if (stored.expiresAt < new Date() || stored.user.status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      this.audit.warn("auth.refresh.failure", {
        userId: stored.userId,
        reason: "expired_or_inactive",
      });
      throw new UnauthorizedError("Invalid refresh token");
    }

    const tokens = await this.issueTokens(stored.user, stored.familyId);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: tokens.refreshTokenId },
    });

    this.audit.info("auth.refresh.success", { userId: stored.userId, familyId: stored.familyId });
    return { user: this.sanitizeUser(stored.user), ...tokens };
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (stored) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        companyMembers: { include: { company: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.sanitizeUser(user);
  }

  async issueSessionForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        companyMembers: { include: { company: true } },
      },
    });
    if (!user || user.status !== UserStatus.ACTIVE) throw new UnauthorizedError("Invalid credentials");
    const tokens = await this.issueTokens(user);
    return { user: this.sanitizeUser(user), ...tokens };
  }

  async forgotPassword(email: string) {
    const generic = {
      message: "Se a conta existir, enviaremos instruções.",
    };
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      return generic;
    }

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const token = randomBytes(32).toString("base64url");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    this.audit.info("auth.password.forgot", { userId: user.id });
    if (process.env.NODE_ENV !== "production") {
      return { ...generic, resetToken: token };
    }
    return generic;
  }

  async resetPassword(token: string, password: string) {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedError("Token de recuperação inválido ou expirado");
    }

    const passwordHash = await bcrypt.hash(password, this.bcryptRounds);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: stored.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    this.audit.info("auth.password.reset", { userId: stored.userId });
    return { success: true };
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      role: UserRole;
      companyMembers: { companyId: string }[];
    },
    familyId?: string,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyIds: user.companyMembers.map((m) => m.companyId),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshExpiresMs);
    const resolvedFamilyId = familyId ?? randomBytes(16).toString("hex");

    const created = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: resolvedFamilyId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      expiresIn: getJwtAccessExpiresIn(),
    };
  }

  private sanitizeUser(user: {
    id: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    createdAt: Date;
    profile: { fullName: string; phone: string | null; avatarUrl: string | null; document: string | null } | null;
    companyMembers: { role: CompanyMemberRole; company: { id: string; name: string; slug: string } }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            phone: user.profile.phone,
            avatarUrl: user.profile.avatarUrl,
          }
        : null,
      companies: user.companyMembers.map((m) => ({
        memberRole: m.role,
        ...m.company,
      })),
    };
  }
}

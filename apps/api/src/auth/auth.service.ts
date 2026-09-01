import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { UserRole, UserStatus, CompanyMemberRole } from "@prisma/client";
import {
  ConflictError,
  UnauthorizedError,
  ValidationError,
} from "@evcharge/domain";
import type { LoginInput, RegisterInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";
import { JwtPayload } from "../common/types/auth.types";
import {
  generateRefreshToken,
  hashToken,
  parseDurationToMs,
} from "../common/utils/token.util";

@Injectable()
export class AuthService {
  private readonly bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
  private readonly refreshExpiresMs = parseDurationToMs(
    process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  );

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    if (existing) throw new ConflictError("Email already registered");

    if (input.role === UserRole.SUPER_ADMIN) {
      throw new ValidationError("Cannot self-register as super_admin");
    }

    if (input.company && input.role === UserRole.DRIVER) {
      throw new ValidationError("Drivers cannot register with a company");
    }

    if (
      (input.role === UserRole.OPERATOR || input.role === UserRole.ADMIN) &&
      !input.company
    ) {
      throw new ValidationError("Operators and admins must provide company data");
    }

    const passwordHash = await bcrypt.hash(input.password, this.bcryptRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          role: input.role,
          profile: {
            create: { fullName: input.fullName },
          },
        },
        include: { profile: true, companyMembers: { include: { company: true } } },
      });

      if (input.company) {
        await tx.companyMember.create({
          data: {
            userId: created.id,
            companyId: (
              await tx.company.create({ data: input.company })
            ).id,
            role: CompanyMemberRole.OWNER,
          },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          profile: true,
          companyMembers: { include: { company: true } },
        },
      });
    });

    const tokens = await this.issueTokens(user!);
    return { user: this.sanitizeUser(user!), ...tokens };
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
      throw new UnauthorizedError("Invalid credentials");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) throw new UnauthorizedError("Invalid credentials");

    const tokens = await this.issueTokens(user);
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

    if (
      !stored ||
      stored.revokedAt ||
      stored.expiresAt < new Date() ||
      stored.user.status !== UserStatus.ACTIVE
    ) {
      throw new UnauthorizedError("Invalid refresh token");
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(stored.user);
    return { user: this.sanitizeUser(stored.user), ...tokens };
  }

  async logout(refreshToken: string) {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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

  private async issueTokens(user: {
    id: string;
    email: string;
    role: UserRole;
    companyMembers: { companyId: string }[];
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyIds: user.companyMembers.map((m) => m.companyId),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshExpiresMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
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
      profile: user.profile,
      companies: user.companyMembers.map((m) => ({
        memberRole: m.role,
        ...m.company,
      })),
    };
  }
}

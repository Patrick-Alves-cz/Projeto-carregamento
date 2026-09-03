import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Request } from "express";
import { UserStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { JwtPayload, AuthenticatedUser } from "../common/types/auth.types";
import { getRequiredJwtAccessSecret } from "../common/config/jwt-secrets";

function fromCookie(req: Request): string | null {
  const token = req.cookies?.evcharge_access;
  return typeof token === "string" && token.length > 0 ? token : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: getRequiredJwtAccessSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { companyMembers: true },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid or inactive user");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      companyIds: user.companyMembers.map((m: { companyId: string }) => m.companyId),
    };
  }
}

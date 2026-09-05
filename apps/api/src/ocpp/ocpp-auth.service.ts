import { randomBytes } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { ChargerCredentialStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { OcppLogger } from "./ocpp-logger";

export type AuthenticatedCharger = {
  chargerId: string;
  identity: string;
  companyId: string;
};

@Injectable()
export class OcppAuthService {
  private readonly logger = new OcppLogger(new Logger(OcppAuthService.name));

  constructor(private readonly prisma: PrismaService) {}

  async authenticate(identity: string, secret: string | undefined): Promise<AuthenticatedCharger | null> {
    const charger = await this.prisma.charger.findUnique({
      where: { identity },
      include: { station: true, credentials: { where: { status: ChargerCredentialStatus.ACTIVE } } },
    });
    if (!charger) {
      this.logger.warn("ocpp.auth.unknown", { identity });
      await this.prisma.securityEvent.create({
        data: { type: "ocpp.unknown_charger", payload: { identity } },
      });
      return null;
    }

    const credential = charger.credentials[0];
    if (!credential || !secret) {
      this.logger.warn("ocpp.auth.rejected", { chargerId: charger.id });
      return null;
    }

    const ok = await bcrypt.compare(secret, credential.credentialHash);
    if (!ok) {
      this.logger.warn("ocpp.auth.rejected", { chargerId: charger.id });
      await this.prisma.securityEvent.create({
        data: { type: "ocpp.invalid_credential", payload: { chargerId: charger.id } },
      });
      return null;
    }

    await this.prisma.chargerCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      chargerId: charger.id,
      identity: charger.identity,
      companyId: charger.station.companyId,
    };
  }

  async rotateCredential(chargerId: string, providedSecret?: string) {
    const secret = providedSecret?.trim() || randomBytes(24).toString("base64url");
    const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
    const credentialHash = await bcrypt.hash(secret, Number.isFinite(rounds) ? rounds : 12);

    await this.prisma.$transaction(async (tx) => {
      await tx.chargerCredential.updateMany({
        where: { chargerId, status: ChargerCredentialStatus.ACTIVE },
        data: { status: ChargerCredentialStatus.REVOKED, rotatedAt: new Date() },
      });
      await tx.chargerCredential.create({
        data: { chargerId, credentialHash },
      });
    });

    this.logger.info("ocpp.credential.rotated", { chargerId });
    return secret;
  }
}

export function parseBasicSecret(authorization: string | undefined): { identity?: string; secret?: string } {
  if (!authorization) return {};
  const [scheme, encoded] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !encoded) return {};
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return { secret: decoded };
    return { identity: decoded.slice(0, idx), secret: decoded.slice(idx + 1) };
  } catch {
    return {};
  }
}

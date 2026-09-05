import { Injectable } from "@nestjs/common";
import { IncidentSeverity, IncidentType } from "@prisma/client";
import { detectMeteringAnomaly } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";
import { IncidentsService } from "./incidents.service";

@Injectable()
export class MeteringHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly incidents: IncidentsService,
  ) {}

  async inspect(input: {
    sessionId: string;
    chargerId: string;
    stationId: string;
    companyId: string;
    previousEnergyKwh?: number | null;
    energyKwh: number;
    powerKw: number;
    maxPowerKw?: number | null;
  }) {
    const anomaly = detectMeteringAnomaly(input);
    if (!anomaly) return null;
    await this.incidents.openOrTouch({
      companyId: input.companyId,
      stationId: input.stationId,
      chargerId: input.chargerId,
      sessionId: input.sessionId,
      type: IncidentType.METERING_ANOMALY,
      severity: IncidentSeverity.WARNING,
      title: "Anomalia de medição",
      description: `Padrão ${anomaly} na sessão.`,
    });
    return anomaly;
  }
}

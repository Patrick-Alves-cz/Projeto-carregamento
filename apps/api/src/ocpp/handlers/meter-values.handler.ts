import { meterValuesSchema, parseMeasurand, toW, toWh, whToKwh, wToKw } from "@evcharge/ocpp";
import type { OcppInboundService } from "../ocpp-inbound.service";

export async function handleMeterValues(
  inbound: OcppInboundService,
  chargerId: string,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const body = meterValuesSchema.parse(payload);
  for (const sample of body.meterValue) {
    const reading: {
      energyKwh?: number;
      powerKw?: number;
      voltage?: number;
      current?: number;
      socPercent?: number;
    } = {};
    for (const value of sample.sampledValue) {
      const numeric = Number(value.value);
      if (Number.isNaN(numeric)) continue;
      const kind = parseMeasurand(value.measurand);
      if (kind === "energy") reading.energyKwh = whToKwh(toWh(numeric, value.unit));
      if (kind === "power") reading.powerKw = wToKw(toW(numeric, value.unit));
      if (kind === "voltage") reading.voltage = numeric;
      if (kind === "current") reading.current = numeric;
      if (kind === "soc") reading.socPercent = numeric;
    }
    await inbound.ingestMeter({
      chargerId,
      companyId,
      connectorNumber: body.connectorId,
      transactionId: body.transactionId,
      timestamp: new Date(sample.timestamp),
      ...reading,
    });
  }
  return {};
}

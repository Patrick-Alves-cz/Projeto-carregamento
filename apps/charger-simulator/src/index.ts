#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { OcppChargePointSimulator } from "./ocpp-client";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

function readArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  const envKey = name.replace(/-/g, "_").toUpperCase();
  return process.env[envKey] ?? fallback;
}

async function runMock(): Promise<void> {
  const { PrismaClient } = await import("@prisma/client");
  const chargerProvider = await import("@evcharge/charger-provider");
  const { ChargerProviderFactory } = chargerProvider;
  type SimulationScenario = import("@evcharge/charger-provider").SimulationScenario;
  const prisma = new PrismaClient();
  const scenario = readArg("scenario", "NORMAL") as SimulationScenario;
  const meterIntervalMs = Number(readArg("meter-interval", "3000"));
  const limit = Number(readArg("limit", "0"));

  console.log("EV Charge — Mock charger simulator");
  ChargerProviderFactory.resetMockInstance();
  const provider = ChargerProviderFactory.create("mock") as InstanceType<
    typeof chargerProvider.MockChargerProvider
  >;
  const chargers = await prisma.charger.findMany({
    take: limit > 0 ? limit : undefined,
    include: { connectors: { orderBy: { number: "asc" } } },
    orderBy: { serialNumber: "asc" },
  });
  if (chargers.length === 0) {
    console.error("No chargers found. Run pnpm db:seed first.");
    process.exit(1);
  }
  for (const charger of chargers) {
    if (charger.providerId === "ocpp16" || charger.providerId === "ocpp") continue;
    await provider.registerCharger(charger.id, {
      maxPowerKw: Number(charger.maxPowerKw),
      scenario,
      meterIntervalMs,
      connectors: charger.connectors.map((c) => ({
        number: c.number,
        maxPowerKw: Number(c.maxPowerKw),
        status: c.status === "AVAILABLE" ? "available" : c.status === "FAULTED" ? "faulted" : "unavailable",
      })),
    });
    if (charger.status !== "OFFLINE" && charger.status !== "FAULTED") {
      await provider.connect(charger.id);
    }
    console.log(`  Registered ${charger.serialNumber}`);
  }
  console.log("Mock simulator running. Press Ctrl+C to stop.");
  process.on("SIGINT", () => {
    provider.dispose();
    void prisma.$disconnect().then(() => process.exit(0));
  });
  await new Promise<void>(() => undefined);
}

async function runOcpp(): Promise<void> {
  const simulator = new OcppChargePointSimulator({
    chargerId: readArg("charger-id", process.env.CHARGER_ID ?? "EVSE-CUIABA-001"),
    ocppUrl: readArg("ocpp-url", process.env.OCPP_URL ?? "ws://localhost:3001/ocpp"),
    secret: readArg("secret", process.env.CHARGER_SECRET ?? "DemoCharger@12345"),
    vendor: readArg("vendor", process.env.CHARGER_VENDOR ?? "EVCharge"),
    model: readArg("model", process.env.CHARGER_MODEL ?? "Sim16"),
    connectorCount: Number(readArg("connectors", process.env.CONNECTOR_COUNT ?? "2")),
    meterIntervalMs: Number(readArg("meter-interval", process.env.METER_INTERVAL_MS ?? "10000")),
    firmwareVersion: readArg("firmware", process.env.CHARGER_FIRMWARE ?? "1.6.0-sim"),
  });

  console.log("EV Charge — OCPP 1.6J simulator");
  console.log(`  chargerId: ${readArg("charger-id", process.env.CHARGER_ID ?? "EVSE-CUIABA-001")}`);
  console.log(`  url: ${readArg("ocpp-url", process.env.OCPP_URL ?? "ws://localhost:3001/ocpp")}`);
  await simulator.start();
  console.log("Simulator running. Press Ctrl+C to stop.");
  process.on("SIGINT", () => {
    void simulator.stop().then(() => process.exit(0));
  });
}

async function main() {
  const mode = readArg("mode", "ocpp");
  if (mode === "mock") {
    await runMock();
    return;
  }
  await runOcpp();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

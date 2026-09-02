#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  ChargerProviderFactory,
  MockChargerProvider,
  type SimulationScenario,
} from "@evcharge/charger-provider";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

const prisma = new PrismaClient();

function readArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1]!;
  return process.env[name.toUpperCase()] ?? fallback;
}

async function main() {
  const scenario = readArg("scenario", "NORMAL") as SimulationScenario;
  const meterIntervalMs = Number(readArg("meter-interval", "3000"));
  const limit = Number(readArg("limit", "0"));

  console.log("EV Charge — Charger Simulator");
  console.log(`Scenario: ${scenario}`);
  console.log(`Meter interval: ${meterIntervalMs}ms`);
  console.log("Note: live charging sessions are simulated inside the API MockChargerProvider.");
  console.log("This process registers the same chargers and logs heartbeats/status for demo.");

  ChargerProviderFactory.resetMockInstance();
  const provider = ChargerProviderFactory.create("mock") as MockChargerProvider;

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
    await provider.registerCharger(charger.id, {
      maxPowerKw: Number(charger.maxPowerKw),
      scenario,
      meterIntervalMs,
      connectors: charger.connectors.map((c) => ({
        number: c.number,
        maxPowerKw: Number(c.maxPowerKw),
        status:
          c.status === "AVAILABLE"
            ? "available"
            : c.status === "FAULTED"
              ? "faulted"
              : "unavailable",
      })),
    });

    if (charger.status !== "OFFLINE" && charger.status !== "FAULTED") {
      await provider.connect(charger.id);
    }

    console.log(
      `  Registered ${charger.serialNumber} (${charger.connectors.length} connectors, ${charger.maxPowerKw} kW)`,
    );
  }

  provider.subscribeMeterValues((event) => {
    console.log(
      `[meter] charger=${event.chargerId} connector=${event.connectorNumber} session=${event.sessionId} energy=${event.reading.energyKwh.toFixed(2)}kWh power=${event.reading.powerKw.toFixed(1)}kW`,
    );
  });

  provider.subscribeStatusChanges((event) => {
    console.log(
      `[status] charger=${event.chargerId} ${event.previousStatus} → ${event.status}${event.reason ? ` (${event.reason})` : ""}`,
    );
  });

  const heartbeat = setInterval(() => {
    void (async () => {
      for (const charger of chargers) {
        try {
          const diag = await provider.getDiagnostics(charger.id);
          console.log(
            `[heartbeat] ${charger.serialNumber} uptime=${diag.uptime}s last=${diag.lastHeartbeat?.toISOString()}`,
          );
        } catch {
          // ignore
        }
      }
    })();
  }, 30_000);

  console.log("\nSimulator running. Press Ctrl+C to stop.");

  process.on("SIGINT", () => {
    void (async () => {
      clearInterval(heartbeat);
      provider.dispose();
      await prisma.$disconnect();
      process.exit(0);
    })();
  });

  await new Promise<void>(() => undefined);
}

main().catch((error) => {
  console.error(error);
  void prisma.$disconnect().then(() => process.exit(1));
});

import { ChargerProviderFactory } from "@evcharge/charger-provider";

const providerType = (process.env.CHARGER_PROVIDER_TYPE ?? "mock") as "mock";

console.log("EV Charge — Charger Simulator");
console.log("Phase 0: foundation only");
console.log(`Provider type: ${providerType}`);

const provider = ChargerProviderFactory.create(providerType);

console.log("ChargerProvider initialized:", provider.constructor.name);
console.log("Waiting for Phase 2 to implement simulation logic...");

// Keep process alive during development
process.stdin.resume();

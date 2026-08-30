import type { ChargerProvider } from "../interfaces/charger-provider.interface";
import type { ChargerProviderType } from "../types";
import { MockChargerProvider } from "../mock/mock-charger-provider";

export class ChargerProviderFactory {
  static create(type: ChargerProviderType): ChargerProvider {
    switch (type) {
      case "mock":
        return new MockChargerProvider();
      case "ocpp16":
      case "ocpp201":
      case "ocpp21":
        throw new Error(
          `ChargerProvider type "${type}" is not implemented yet. Use "mock" for development.`,
        );
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown ChargerProvider type: ${_exhaustive}`);
      }
    }
  }
}

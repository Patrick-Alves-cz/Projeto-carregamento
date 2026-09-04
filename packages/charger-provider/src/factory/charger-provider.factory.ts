import type { ChargerProvider } from "../interfaces/charger-provider.interface";
import type { OcppCommandPort } from "../interfaces/ocpp-command-port";
import type { ChargerProviderType } from "../types";
import { MockChargerProvider } from "../mock/mock-charger-provider";
import { OcppChargerProvider } from "../ocpp/ocpp-charger-provider";

let mockSingleton: MockChargerProvider | null = null;

export class ChargerProviderFactory {
  static create(type: ChargerProviderType, options?: { commandPort?: OcppCommandPort }): ChargerProvider {
    switch (type) {
      case "mock":
        if (!mockSingleton) {
          mockSingleton = new MockChargerProvider();
        }
        return mockSingleton;
      case "ocpp16":
        if (!options?.commandPort) {
          throw new Error("OcppChargerProvider requires a command port");
        }
        return new OcppChargerProvider(options.commandPort);
      case "ocpp201":
      case "ocpp21":
        throw new Error(
          `ChargerProvider type "${type}" is not implemented yet. Use "mock" or "ocpp16".`,
        );
      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown ChargerProvider type: ${_exhaustive}`);
      }
    }
  }

  static getMockInstance(): MockChargerProvider | null {
    return mockSingleton;
  }

  static resetMockInstance(): void {
    mockSingleton?.dispose();
    mockSingleton = null;
  }
}

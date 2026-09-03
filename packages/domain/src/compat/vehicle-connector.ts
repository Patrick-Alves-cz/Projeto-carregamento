import { ValidationError } from "../errors";

export function isVehicleCompatibleWithConnector(
  vehicleConnectorTypes: readonly string[],
  connectorType: string,
): boolean {
  return vehicleConnectorTypes.includes(connectorType);
}

export function assertVehicleConnectorCompatibility(
  vehicleConnectorTypes: readonly string[],
  connectorType: string,
): void {
  if (!isVehicleCompatibleWithConnector(vehicleConnectorTypes, connectorType)) {
    throw new ValidationError("Veículo incompatível com este conector.");
  }
}

export const DRIVER_ERROR_MESSAGES: Record<string, string> = {
  CHARGER_OFFLINE: "Este carregador está temporariamente indisponível.",
  CHARGER_FAULTED: "Este conector apresentou uma falha. Escolha outro disponível.",
  CONNECTOR_UNAVAILABLE: "Este conector está ocupado ou indisponível.",
  CONNECTOR_FAULT: "Este conector apresentou uma falha. Escolha outro disponível.",
  REMOTE_START_REJECTED:
    "Não foi possível iniciar o carregamento. Tente novamente ou escolha outro conector.",
  REMOTE_STOP_FAILED: "Não foi possível encerrar agora. Tente novamente em instantes.",
  MAINTENANCE: "Temporariamente indisponível para manutenção.",
  RESERVATION_WINDOW: "Você ainda não está na janela para iniciar esta reserva.",
  RESERVATION_EXPIRED: "A janela da reserva já expirou.",
  COMMUNICATION_LOSS: "Falha de comunicação com o carregador. Aguarde ou tente outro conector.",
};

export function driverFacingMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback;
  return DRIVER_ERROR_MESSAGES[code] ?? fallback;
}

export function sessionVisualState(input: {
  status: string;
  communicationStale?: boolean;
  chargingComplete?: boolean;
  idle?: boolean;
}): { code: string; label: string } {
  if (input.communicationStale) {
    return { code: "COMMUNICATION_LOSS", label: "Falha de comunicação" };
  }
  if (input.status === "PREPARING" || input.status === "PENDING") {
    return { code: "PREPARING", label: "Preparando carregador" };
  }
  if (input.status === "ACTIVE") return { code: "CHARGING", label: "Carregando" };
  if (input.status === "PAUSED") return { code: "PAUSED", label: "Pausado" };
  if (input.status === "CHARGING_COMPLETE") {
    return { code: "CHARGING_COMPLETE", label: "Carregamento concluído" };
  }
  if (input.status === "IDLE") return { code: "IDLE", label: "Veículo ainda conectado" };
  if (input.status === "COMPLETED") return { code: "COMPLETED", label: "Finalizando" };
  if (input.status === "FAILED") return { code: "FAILED", label: "Falha de comunicação" };
  return { code: input.status, label: input.status };
}

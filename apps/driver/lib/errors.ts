import { ApiError } from "./api-client";

export function driverErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR" && /incompat/i.test(error.message)) {
      return "Este conector não é compatível com o veículo selecionado.";
    }
    if (error.code === "CHARGER_OFFLINE" || error.code === "COMMUNICATION_LOSS") {
      return "Este carregador está temporariamente indisponível.";
    }
    if (error.code === "REMOTE_START_REJECTED") {
      return "Não foi possível iniciar o carregamento. Tente novamente ou escolha outro conector.";
    }
    if (error.code === "CONNECTOR_FAULT" || error.code === "CHARGER_FAULTED") {
      return "Este conector apresentou uma falha. Escolha outro disponível.";
    }
    if (error.code === "MAINTENANCE") {
      return "Temporariamente indisponível para manutenção.";
    }
    if (error.code === "CONNECTOR_UNAVAILABLE") {
      if (/offline/i.test(error.message)) return "Este carregador está offline no momento.";
      return "Este conector está ocupado ou indisponível.";
    }
    if (error.code === "INSUFFICIENT_BALANCE") {
      return "Adicione saldo para iniciar a recarga.";
    }
    if (error.code === "PAYMENT_FAILED") {
      return "Não foi possível autorizar o pagamento. Tente outro método.";
    }
    if (error.code === "PAYMENT_REQUIRES_ACTION") {
      return "Confirme o pagamento para iniciar a recarga.";
    }
    if (error.code === "SESSION_STATE_ERROR") {
      return "Você já possui uma recarga em andamento.";
    }
    if (error.code === "CONFLICT" && /sessão ativa/i.test(error.message)) {
      return "Já existe uma recarga ativa neste conector.";
    }
    if (error.code === "FORBIDDEN") {
      return "Você não tem permissão para esta ação.";
    }
    if (error.status === 404) {
      return "Não encontramos esta estação ou conector.";
    }
    if (error.status && error.status >= 500) {
      return "Estamos com uma instabilidade temporária. Tente novamente em instantes.";
    }
    if (error.message && !/^Erro \d+$/i.test(error.message)) {
      return error.message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível concluir agora. Tente novamente.";
}

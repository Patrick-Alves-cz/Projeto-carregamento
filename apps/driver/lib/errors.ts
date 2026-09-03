import { ApiError } from "./api-client";

export function driverErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "VALIDATION_ERROR" && /incompat/i.test(error.message)) {
      return "Este conector não é compatível com o veículo selecionado.";
    }
    if (error.code === "CONNECTOR_UNAVAILABLE") {
      if (/offline/i.test(error.message)) return "Este carregador está offline no momento.";
      return "Este conector está ocupado ou indisponível.";
    }
    if (error.code === "INSUFFICIENT_BALANCE") {
      return error.message.startsWith("Saldo")
        ? error.message
        : "Saldo insuficiente para iniciar a recarga.";
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

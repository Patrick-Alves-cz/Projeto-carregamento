/**
 * Calculates session cost in integer cents from energy (kWh) and price per kWh (cents).
 */
export function calculateCostCents(energyKwh: number, pricePerKwhCents: number): number {
  if (energyKwh <= 0 || pricePerKwhCents <= 0) return 0;
  return Math.round(energyKwh * pricePerKwhCents);
}

export function formatCurrencyBrl(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

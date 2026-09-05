export type WaitTimeEstimate = {
  minutes: number | null;
  label: string;
  available: boolean;
};

export function estimateWaitMinutes(input: {
  compatibleConnectors: number;
  availableNow: number;
  queueAhead: number;
  remainingSessionMinutes: number[];
  averageSessionMinutes?: number | null;
}): WaitTimeEstimate {
  if (input.compatibleConnectors <= 0) {
    return { minutes: null, label: "tempo indisponível", available: false };
  }
  if (input.availableNow > 0 && input.queueAhead === 0) {
    return { minutes: 0, label: "disponível agora", available: true };
  }
  const avg = input.averageSessionMinutes && input.averageSessionMinutes > 0 ? input.averageSessionMinutes : null;
  const remaining = input.remainingSessionMinutes.filter((value) => value > 0);
  if (remaining.length === 0 && avg == null) {
    return { minutes: null, label: "tempo indisponível", available: false };
  }
  const nextFree = remaining.length > 0 ? Math.min(...remaining) : (avg ?? 25);
  const extra =
    input.queueAhead > 0
      ? Math.ceil((input.queueAhead * (avg ?? nextFree)) / Math.max(input.compatibleConnectors, 1))
      : 0;
  const minutes = Math.max(0, Math.round(nextFree + extra));
  return { minutes, label: waitTimeLabel(minutes), available: true };
}

export function waitTimeLabel(minutes: number): string {
  if (minutes <= 0) return "disponível agora";
  if (minutes <= 10) return "~10 min";
  if (minutes <= 20) return "~20 min";
  if (minutes <= 30) return "~20–30 min";
  if (minutes <= 45) return "~30–45 min";
  return "tempo indisponível";
}

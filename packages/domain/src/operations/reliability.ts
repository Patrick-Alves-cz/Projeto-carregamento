export type ReliabilityInputs = {
  uptimeMinutes: number;
  windowMinutes: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsFailed: number;
  commandsSent: number;
  commandsSucceeded: number;
  remoteStartFailures: number;
  remoteStopFailures: number;
  connectorFaultEvents: number;
  offlineEvents: number;
  recoveredEvents: number;
};

export type ReliabilityBreakdown = {
  score: number;
  uptimeRate: number;
  successfulSessionsRate: number;
  commandSuccessRate: number;
  recoveryRate: number;
  faultPenalty: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rate(numerator: number, denominator: number) {
  if (denominator <= 0) return 1;
  return clamp(numerator / denominator, 0, 1);
}

/**
 * Reliability 0–100.
 *
 * score = round(
 *   35 * uptimeRate +
 *   30 * successfulSessionsRate +
 *   25 * commandSuccessRate +
 *   10 * recoveryRate
 * ) - faultPenalty
 *
 * faultPenalty = min(40, 5 * connectorFaults + 3 * offlineEvents + 4 * remoteStartFailures + 2 * remoteStopFailures)
 */
export function calculateReliabilityScore(input: ReliabilityInputs): ReliabilityBreakdown {
  const windowMinutes = Math.max(1, input.windowMinutes);
  const uptimeRate = clamp(input.uptimeMinutes / windowMinutes, 0, 1);
  const successfulSessionsRate = rate(input.sessionsCompleted, input.sessionsStarted);
  const commandSuccessRate = rate(input.commandsSucceeded, input.commandsSent);
  const recoveryRate = rate(input.recoveredEvents, input.offlineEvents);
  const faultPenalty = Math.min(
    40,
    input.connectorFaultEvents * 5 +
      input.offlineEvents * 3 +
      input.remoteStartFailures * 4 +
      input.remoteStopFailures * 2,
  );
  const weighted = 35 * uptimeRate + 30 * successfulSessionsRate + 25 * commandSuccessRate + 10 * recoveryRate;
  const score = Math.round(clamp(weighted - faultPenalty, 0, 100));
  return {
    score,
    uptimeRate,
    successfulSessionsRate,
    commandSuccessRate,
    recoveryRate,
    faultPenalty,
  };
}

export function reliabilityDriverLabel(score: number): string {
  if (score >= 90) return "Muito confiável";
  if (score >= 75) return "Confiável";
  if (score >= 50) return "Instável";
  return "Baixa confiabilidade";
}

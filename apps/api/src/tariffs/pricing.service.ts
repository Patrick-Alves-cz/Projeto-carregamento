import { Injectable } from "@nestjs/common";
import {
  calculateCurrentCost,
  calculateEstimatedCost,
  calculateFinalCost,
  type SessionCostInput,
} from "@evcharge/domain";

@Injectable()
export class PricingService {
  calculateEstimatedCost(input: Pick<SessionCostInput, "energyKwh" | "durationMinutes" | "snapshot">) {
    return calculateEstimatedCost(input);
  }

  calculateCurrentCost(input: SessionCostInput) {
    return calculateCurrentCost(input);
  }

  calculateFinalCost(input: SessionCostInput) {
    return calculateFinalCost(input);
  }
}

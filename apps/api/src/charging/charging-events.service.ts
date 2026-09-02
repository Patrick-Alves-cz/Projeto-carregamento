import { Injectable, Logger } from "@nestjs/common";
import type { DomainEvent } from "@evcharge/domain";
import { PrismaService } from "../common/database/database.module";

@Injectable()
export class ChargingEventsService {
  private readonly logger = new Logger(ChargingEventsService.name);
  private readonly listeners = new Set<(event: DomainEvent) => void>();

  constructor(private readonly prisma: PrismaService) {}

  subscribe(listener: (event: DomainEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async publish(event: DomainEvent): Promise<void> {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        this.logger.error(`Event listener failed for ${event.type}`, error);
      }
    });

    try {
      await this.prisma.chargingEvent.create({
        data: {
          entityType: event.entityType,
          entityId: event.entityId,
          eventType: event.type,
          payload: event.payload as object,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to persist charging event ${event.type}`, error);
    }
  }
}

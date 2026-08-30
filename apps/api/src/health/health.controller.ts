import { Controller, Get } from "@nestjs/common";
import { prisma } from "@evcharge/database";

@Controller("health")
export class HealthController {
  @Get()
  async check() {
    let database: "connected" | "disconnected" = "disconnected";

    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "disconnected";
    }

    return {
      status: database === "connected" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database,
      },
    };
  }
}

import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../common/decorators/auth.decorators";
import { PrismaService } from "../common/database/database.module";

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    let database: "connected" | "disconnected" = "disconnected";

    try {
      await this.prisma.$queryRaw`SELECT 1`;
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

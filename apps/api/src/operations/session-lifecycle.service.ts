import { Injectable } from "@nestjs/common";
import { NotificationType, SessionStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class SessionLifecycleService {
  private readonly idleGraceMinutes = Number(process.env.IDLE_GRACE_MINUTES ?? 5);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async applyIdleTransitions() {
    const now = Date.now();
    const complete = await this.prisma.chargingSession.findMany({
      where: { status: SessionStatus.CHARGING_COMPLETE },
    });
    for (const session of complete) {
      const completedAt = session.chargingCompletedAt ?? session.updatedAt;
      if (now - completedAt.getTime() < this.idleGraceMinutes * 60_000) {
        if (!session.idleStartedAt) {
          await this.notifications.notify({
            userId: session.userId,
            type: NotificationType.IDLE_FEE_WARNING,
            title: "Taxa de permanência em breve",
            body: "O carregamento terminou. Desconecte o veículo para evitar taxa de permanência.",
            payload: { sessionId: session.id },
            dedupeKey: `idle-warning-${session.id}`,
          });
        }
        continue;
      }
      await this.prisma.chargingSession.update({
        where: { id: session.id },
        data: { status: SessionStatus.IDLE, idleStartedAt: session.idleStartedAt ?? new Date() },
      });
    }
  }

  markChargingCompleteData() {
    return {
      status: SessionStatus.CHARGING_COMPLETE,
      chargingCompletedAt: new Date(),
    };
  }

  idleMinutes(session: { idleStartedAt?: Date | null; endedAt?: Date | null }) {
    if (!session.idleStartedAt) return 0;
    const end = session.endedAt ?? new Date();
    return Math.max(0, (end.getTime() - session.idleStartedAt.getTime()) / 60_000);
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { AuditLogger } from "../common/logging/audit-logger";

@Injectable()
export class NotificationsService {
  private readonly audit = new AuditLogger(new Logger(NotificationsService.name));

  constructor(private readonly prisma: PrismaService) {}

  async notify(params: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    payload?: Prisma.InputJsonValue;
    dedupeKey?: string;
  }) {
    if (params.dedupeKey) {
      const existing = await this.prisma.inAppNotification.findUnique({
        where: { dedupeKey: params.dedupeKey },
      });
      if (existing) return existing;
    }

    const created = await this.prisma.inAppNotification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body,
        payload: params.payload ?? {},
        dedupeKey: params.dedupeKey,
      },
    });
    this.audit.info("notification.created", {
      userId: params.userId,
      type: params.type,
      notificationId: created.id,
    });
    return created;
  }

  async listForUser(userId: string) {
    return this.prisma.inAppNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    const existing = await this.prisma.inAppNotification.findFirst({ where: { id, userId } });
    if (!existing) return null;
    if (existing.readAt) return existing;
    return this.prisma.inAppNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }
}

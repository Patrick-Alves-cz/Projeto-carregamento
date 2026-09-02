import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Server, Socket } from "socket.io";
import type { DomainEvent } from "@evcharge/domain";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { ChargingEventsService } from "../charging/charging-events.service";
import type { JwtPayload } from "../common/types/auth.types";

@WebSocketGateway({
  cors: {
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:8081",
      "http://127.0.0.1:8081",
    ],
    credentials: true,
  },
  namespace: "/realtime",
})
export class ChargingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChargingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly chargingEvents: ChargingEventsService,
  ) {}

  afterInit(): void {
    this.chargingEvents.subscribe((event) => this.broadcast(event));
    this.logger.log("ChargingGateway initialized");
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<JwtPayload>(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { companyMembers: true },
      });

      if (!user) {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        role: user.role,
        companyIds: user.companyMembers.map((m) => m.companyId),
      };

      await client.join(`user:${user.id}`);

      if (user.role !== UserRole.DRIVER) {
        for (const companyId of client.data.user.companyIds) {
          await client.join(`company:${companyId}`);
        }
        if (user.role === UserRole.SUPER_ADMIN) {
          await client.join("superadmin");
        }
      }

      this.logger.debug(`Client connected: ${user.email} (${user.role})`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  private broadcast(event: DomainEvent): void {
    const payload = event.payload as Record<string, unknown>;
    const sessionUserId = payload.userId as string | undefined;

    this.server.emit(event.type, {
      type: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
    });

    if (sessionUserId) {
      this.server.to(`user:${sessionUserId}`).emit("session.event", {
        type: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        payload: event.payload,
        timestamp: event.timestamp.toISOString(),
      });
    }

    this.server.to("superadmin").emit("operations.event", {
      type: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
    });
  }
}

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
import { UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../common/database/database.module";
import { ChargingEventsService } from "../charging/charging-events.service";
import type { JwtPayload } from "../common/types/auth.types";
import { getRequiredJwtAccessSecret } from "../common/config/jwt-secrets";

type RealtimeEnvelope = {
  type: string;
  entityType: string;
  entityId: string;
  payload: unknown;
  timestamp: string;
};

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

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: getRequiredJwtAccessSecret(),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { companyMembers: true },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        role: user.role,
        companyIds: user.companyMembers.map((m) => m.companyId),
      };

      await client.join(`user:${user.id}`);
      await client.join("discovery");

      if (user.role === UserRole.SUPER_ADMIN) {
        await client.join("superadmin");
      } else if (user.role !== UserRole.DRIVER) {
        for (const companyId of client.data.user.companyIds) {
          await client.join(`company:${companyId}`);
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
    const sessionUserId = typeof payload.userId === "string" ? payload.userId : undefined;
    const companyId = typeof payload.companyId === "string" ? payload.companyId : undefined;

    const envelope: RealtimeEnvelope = {
      type: event.type,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: event.payload,
      timestamp: event.timestamp.toISOString(),
    };

    if (sessionUserId) {
      this.emitToRoom(`user:${sessionUserId}`, envelope);
    }

    if (companyId) {
      this.emitToRoom(`company:${companyId}`, envelope, "operations.event");
    }

    this.emitToRoom("superadmin", envelope, "operations.event");

    if (event.type === "connector.status.changed" || event.type === "charger.status.changed") {
      const discoveryEnvelope: RealtimeEnvelope = {
        type: event.type,
        entityType: event.entityType,
        entityId: event.entityId,
        timestamp: event.timestamp.toISOString(),
        payload: {
          connectorId: payload.connectorId,
          chargerId: payload.chargerId,
          stationId: payload.stationId,
          status: payload.status,
        },
      };
      this.emitToRoom("discovery", discoveryEnvelope, "discovery.updated");
    }
  }

  private emitToRoom(room: string, envelope: RealtimeEnvelope, extraEvent?: string): void {
    this.server.to(room).emit(envelope.type, envelope);
    if (extraEvent) {
      this.server.to(room).emit(extraEvent, envelope);
    } else {
      this.server.to(room).emit("session.event", envelope);
    }
  }
}

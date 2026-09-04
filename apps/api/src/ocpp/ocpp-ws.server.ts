import { Injectable, Logger, OnModuleDestroy, OnApplicationBootstrap } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { URL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { OCPP_16_SUBPROTOCOL } from "@evcharge/ocpp";
import { OcppAuthService, parseBasicSecret } from "./ocpp-auth.service";
import { OcppConnectionManager } from "./ocpp-connection.manager";
import { OcppInboundService } from "./ocpp-inbound.service";
import { OcppMessageRouter } from "./ocpp-message.router";
import { OcppLogger } from "./ocpp-logger";

@Injectable()
export class OcppWsServer implements OnModuleDestroy, OnApplicationBootstrap {
  private wss?: WebSocketServer;
  private attached = false;
  private readonly logger = new OcppLogger(new Logger(OcppWsServer.name));

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly auth: OcppAuthService,
    private readonly connections: OcppConnectionManager,
    private readonly router: OcppMessageRouter,
    private readonly inbound: OcppInboundService,
  ) {}

  onApplicationBootstrap() {
    const server = this.adapterHost.httpAdapter.getHttpServer() as HttpServer | undefined;
    if (server) this.attach(server);
  }

  attach(server: HttpServer) {
    if (this.attached) return;
    this.attached = true;
    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => {
        if (protocols.has(OCPP_16_SUBPROTOCOL)) return OCPP_16_SUBPROTOCOL;
        return false;
      },
    });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url ?? "", "http://localhost");
      if (!url.pathname.startsWith("/ocpp/")) return;
      void this.handleUpgrade(request, socket, head, url);
    });
  }

  private async handleUpgrade(
    request: IncomingMessage,
    socket: import("node:stream").Duplex,
    head: Buffer,
    url: URL,
  ) {
    const identity = decodeURIComponent(url.pathname.replace(/^\/ocpp\//, "")).trim();
    const { identity: basicIdentity, secret } = parseBasicSecret(request.headers.authorization);
    if (basicIdentity && basicIdentity !== identity) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    const charger = await this.auth.authenticate(identity, secret);
    if (!charger) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    this.wss?.handleUpgrade(request, socket, head, (ws) => {
      this.wss?.emit("connection", ws, request);
      this.bindSocket(ws, charger);
    });
  }

  private bindSocket(
    ws: WebSocket,
    charger: { chargerId: string; identity: string; companyId: string },
  ) {
    this.connections.register({
      chargerId: charger.chargerId,
      identity: charger.identity,
      companyId: charger.companyId,
      ws,
      connectedAt: new Date(),
      lastMessageAt: new Date(),
    });
    void this.inbound.markConnected(charger.chargerId, charger.companyId);

    ws.on("message", (data) => {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      void this.router.handle(charger.chargerId, charger.companyId, raw).then((reply) => {
        if (reply && ws.readyState === ws.OPEN) ws.send(reply);
      });
    });

    ws.on("close", () => {
      this.connections.unregister(charger.chargerId, ws);
      void this.inbound.markDisconnected(charger.chargerId, charger.companyId);
    });

    ws.on("error", () => {
      this.logger.warn("ocpp.connection.close", { chargerId: charger.chargerId, reason: "socket error" });
    });
  }

  onModuleDestroy() {
    this.wss?.close();
  }
}

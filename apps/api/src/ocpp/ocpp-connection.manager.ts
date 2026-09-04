import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import {
  isCallError,
  isCallResult,
  parseOcppFrame,
  serializeCall,
  type OcppFrame,
} from "@evcharge/ocpp";
import { OcppLogger } from "./ocpp-logger";

type PendingCall = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type OcppSocket = {
  chargerId: string;
  identity: string;
  companyId: string;
  ws: WebSocket;
  connectedAt: Date;
  lastMessageAt: Date;
};

const COMMAND_TIMEOUT_MS = Number(process.env.OCPP_COMMAND_TIMEOUT_MS ?? 10_000);

@Injectable()
export class OcppConnectionManager {
  private readonly connections = new Map<string, OcppSocket>();
  private readonly pending = new Map<string, PendingCall>();
  private readonly logger = new OcppLogger(new Logger(OcppConnectionManager.name));

  register(socket: OcppSocket) {
    const previous = this.connections.get(socket.chargerId);
    if (previous && previous.ws !== socket.ws) {
      this.logger.warn("ocpp.connection.replaced", { chargerId: socket.chargerId });
      try {
        previous.ws.close(4000, "replaced");
      } catch {
        // ignore
      }
    }
    this.connections.set(socket.chargerId, socket);
    this.logger.info("ocpp.connection.open", { chargerId: socket.chargerId, identity: socket.identity });
  }

  unregister(chargerId: string, ws?: WebSocket) {
    const current = this.connections.get(chargerId);
    if (!current) return;
    if (ws && current.ws !== ws) return;
    this.connections.delete(chargerId);
    this.logger.info("ocpp.connection.close", { chargerId });
  }

  get(chargerId: string): OcppSocket | undefined {
    return this.connections.get(chargerId);
  }

  isOnline(chargerId: string): boolean {
    const conn = this.connections.get(chargerId);
    return Boolean(conn && conn.ws.readyState === 1);
  }

  touch(chargerId: string) {
    const conn = this.connections.get(chargerId);
    if (conn) conn.lastMessageAt = new Date();
  }

  listStale(thresholdMs: number): OcppSocket[] {
    const cutoff = Date.now() - thresholdMs;
    return [...this.connections.values()].filter((item) => item.lastMessageAt.getTime() < cutoff);
  }

  sendRaw(chargerId: string, payload: string) {
    const conn = this.connections.get(chargerId);
    if (!conn || conn.ws.readyState !== 1) {
      throw new Error(`Charger ${chargerId} is not connected`);
    }
    conn.ws.send(payload);
    this.logger.info("ocpp.message.sent", { chargerId });
  }

  async call(
    chargerId: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const uniqueId = randomUUID().slice(0, 36);
    const frame = serializeCall(uniqueId, action, payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(uniqueId);
        reject(new Error(`OCPP ${action} timed out`));
      }, COMMAND_TIMEOUT_MS);
      this.pending.set(uniqueId, { resolve, reject, timer });
      try {
        this.sendRaw(chargerId, frame);
        this.logger.info("ocpp.command.sent", { chargerId, action });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(uniqueId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  resolveIncomingResult(frame: OcppFrame) {
    if (isCallResult(frame)) {
      const uniqueId = frame[1];
      const pending = this.pending.get(uniqueId);
      if (!pending) return false;
      clearTimeout(pending.timer);
      this.pending.delete(uniqueId);
      pending.resolve(frame[2]);
      return true;
    }
    if (isCallError(frame)) {
      const uniqueId = frame[1];
      const pending = this.pending.get(uniqueId);
      if (!pending) return false;
      clearTimeout(pending.timer);
      this.pending.delete(uniqueId);
      pending.reject(new Error(`${frame[2]}: ${frame[3]}`));
      return true;
    }
    return false;
  }

  parse(raw: string): OcppFrame {
    return parseOcppFrame(raw);
  }
}

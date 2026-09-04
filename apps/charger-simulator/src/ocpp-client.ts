import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import {
  OCPP_16_SUBPROTOCOL,
  isCall,
  parseOcppFrame,
  serializeCall,
  serializeCallResult,
} from "@evcharge/ocpp";

export type SimulatorConfig = {
  chargerId: string;
  ocppUrl: string;
  secret: string;
  vendor: string;
  model: string;
  connectorCount: number;
  meterIntervalMs: number;
  firmwareVersion: string;
};

type ConnectorState =
  | "Available"
  | "Preparing"
  | "Charging"
  | "SuspendedEV"
  | "Finishing"
  | "Faulted"
  | "Unavailable";

export class OcppChargePointSimulator {
  private ws?: WebSocket;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private meterTimer?: ReturnType<typeof setInterval>;
  private transactionId: number | null = null;
  private idTag = "";
  private activeConnector = 1;
  private meterWh = 0;
  private heartbeatSec = 60;
  private readonly connectorStatus = new Map<number, ConnectorState>();
  private closed = false;

  constructor(private readonly config: SimulatorConfig) {
    for (let i = 1; i <= config.connectorCount; i += 1) {
      this.connectorStatus.set(i, "Available");
    }
  }

  async start(): Promise<void> {
    const base = this.config.ocppUrl.replace(/\/$/, "");
    const url = `${base}/${encodeURIComponent(this.config.chargerId)}`;
    const auth = Buffer.from(`${this.config.chargerId}:${this.config.secret}`).toString("base64");

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, [OCPP_16_SUBPROTOCOL], {
        headers: { Authorization: `Basic ${auth}` },
      });
      this.ws = ws;
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });

    this.ws?.on("message", (data) => {
      void this.onMessage(typeof data === "string" ? data : data.toString("utf8"));
    });
    this.ws?.on("close", () => {
      this.clearTimers();
      this.scheduleReconnect();
    });

    console.log(`[ocpp] connected ${url}`);
    await this.call("BootNotification", {
      chargePointVendor: this.config.vendor,
      chargePointModel: this.config.model,
      firmwareVersion: this.config.firmwareVersion,
      chargePointSerialNumber: this.config.chargerId,
    });
    await this.status(0, "Available");
    for (let i = 1; i <= this.config.connectorCount; i += 1) {
      await this.status(i, "Available");
    }
    this.scheduleHeartbeat();
  }

  async stop(): Promise<void> {
    this.closed = true;
    this.clearTimers();
    this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.closed) return;
    console.log(`[ocpp] disconnected, reconnecting in 3s`);
    setTimeout(() => {
      if (this.closed) return;
      void this.start().catch((error) => {
        console.error("[ocpp] reconnect failed", error);
        this.scheduleReconnect();
      });
    }, 3000);
  }

  private scheduleHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      void this.call("Heartbeat", {});
    }, this.heartbeatSec * 1000);
    this.heartbeatTimer.unref?.();
  }

  private clearTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.heartbeatTimer = undefined;
    this.meterTimer = undefined;
  }

  private async onMessage(raw: string) {
    let frame;
    try {
      frame = parseOcppFrame(raw);
    } catch (error) {
      console.error("[ocpp] malformed frame", error);
      return;
    }
    if (!isCall(frame)) return;
    const uniqueId = frame[1];
    const action = frame[2];
    const payload = frame[3];
    try {
      const result = await this.handleCall(action, payload);
      this.send(serializeCallResult(uniqueId, result));
    } catch (error) {
      console.error(`[ocpp] handler ${action} failed`, error);
      this.send(
        JSON.stringify([4, uniqueId, "InternalError", error instanceof Error ? error.message : "error", {}]),
      );
    }
  }

  private async handleCall(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (action) {
      case "RemoteStartTransaction": {
        const connectorId = Number(payload.connectorId ?? 1);
        const idTag = String(payload.idTag ?? "");
        const status = this.connectorStatus.get(connectorId);
        if (!status || status === "Faulted" || status === "Unavailable" || this.transactionId != null) {
          return { status: "Rejected" };
        }
        void this.beginTransaction(connectorId, idTag);
        return { status: "Accepted" };
      }
      case "RemoteStopTransaction": {
        const txId = Number(payload.transactionId);
        if (this.transactionId == null || this.transactionId !== txId) {
          return { status: "Rejected" };
        }
        void this.endTransaction("Remote");
        return { status: "Accepted" };
      }
      case "Reset":
        setTimeout(() => {
          void this.stop().then(() => {
            this.closed = false;
            return this.start();
          });
        }, 500);
        return { status: "Accepted" };
      case "ChangeAvailability": {
        const connectorId = Number(payload.connectorId);
        const type = String(payload.type);
        const next: ConnectorState = type === "Inoperative" ? "Unavailable" : "Available";
        if (connectorId === 0) {
          for (let i = 1; i <= this.config.connectorCount; i += 1) {
            this.connectorStatus.set(i, next);
            void this.status(i, next);
          }
        } else {
          this.connectorStatus.set(connectorId, next);
          void this.status(connectorId, next);
        }
        return { status: "Accepted" };
      }
      default:
        return {};
    }
  }

  private async beginTransaction(connectorId: number, idTag: string) {
    this.activeConnector = connectorId;
    this.idTag = idTag;
    this.meterWh = 0;
    this.connectorStatus.set(connectorId, "Preparing");
    await this.status(connectorId, "Preparing");
    const auth = await this.call("Authorize", { idTag });
    const authStatus = (auth.idTagInfo as { status?: string } | undefined)?.status;
    if (authStatus && authStatus !== "Accepted") {
      this.connectorStatus.set(connectorId, "Available");
      await this.status(connectorId, "Available");
      return;
    }
    const started = await this.call("StartTransaction", {
      connectorId,
      idTag,
      meterStart: this.meterWh,
      timestamp: new Date().toISOString(),
    });
    this.transactionId = Number(started.transactionId);
    this.connectorStatus.set(connectorId, "Charging");
    await this.status(connectorId, "Charging");
    this.startMeterLoop();
  }

  private async endTransaction(reason: string) {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = undefined;
    const connectorId = this.activeConnector;
    this.connectorStatus.set(connectorId, "Finishing");
    await this.status(connectorId, "Finishing");
    if (this.transactionId != null) {
      await this.call("StopTransaction", {
        transactionId: this.transactionId,
        idTag: this.idTag,
        meterStop: this.meterWh,
        timestamp: new Date().toISOString(),
        reason,
      });
    }
    this.transactionId = null;
    this.connectorStatus.set(connectorId, "Available");
    await this.status(connectorId, "Available");
  }

  private startMeterLoop() {
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = setInterval(() => {
      void this.sendMeter();
    }, this.config.meterIntervalMs);
    this.meterTimer.unref?.();
  }

  private async sendMeter() {
    if (this.transactionId == null) return;
    this.meterWh += 50;
    const powerW = 40000 + Math.round(Math.random() * 5000);
    await this.call("MeterValues", {
      connectorId: this.activeConnector,
      transactionId: this.transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: String(this.meterWh), measurand: "Energy.Active.Import.Register", unit: "Wh" },
            { value: String(powerW), measurand: "Power.Active.Import", unit: "W" },
            { value: "220", measurand: "Voltage", unit: "V" },
            { value: "32", measurand: "Current.Import", unit: "A" },
            { value: String(Math.min(90, 20 + this.meterWh / 50)), measurand: "SoC", unit: "Percent" },
          ],
        },
      ],
    });
    console.log(
      `[meter] connector=${this.activeConnector} energy=${(this.meterWh / 1000).toFixed(2)} kWh power=${(powerW / 1000).toFixed(1)} kW`,
    );
  }

  private async status(connectorId: number, status: ConnectorState | "Available") {
    await this.call("StatusNotification", {
      connectorId,
      errorCode: "NoError",
      status,
      timestamp: new Date().toISOString(),
    });
  }

  private async call(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const uniqueId = randomUUID().slice(0, 36);
    const pending = this.waitResult(uniqueId);
    this.send(serializeCall(uniqueId, action, payload));
    console.log(`[ocpp] → ${action}`);
    return pending;
  }

  private waitResult(uniqueId: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${uniqueId}`)), 15_000);
      const onMessage = (data: WebSocket.RawData) => {
        try {
          const frame = parseOcppFrame(typeof data === "string" ? data : data.toString("utf8"));
          if (frame[0] === 3 && frame[1] === uniqueId) {
            clearTimeout(timer);
            this.ws?.off("message", onMessage);
            resolve(frame[2]);
          }
          if (frame[0] === 4 && frame[1] === uniqueId) {
            clearTimeout(timer);
            this.ws?.off("message", onMessage);
            reject(new Error(String(frame[3])));
          }
        } catch {
          // ignore frames that are not ours
        }
      };
      this.ws?.on("message", onMessage);
    });
  }

  private send(payload: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("OCPP socket is not open");
    }
    this.ws.send(payload);
  }
}

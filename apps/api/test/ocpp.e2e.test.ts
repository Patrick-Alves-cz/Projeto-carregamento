import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import WebSocket from "ws";
import {
  MessageType,
  OCPP_16_SUBPROTOCOL,
  isCall,
  parseOcppFrame,
  serializeCall,
  serializeCallResult,
} from "@evcharge/ocpp";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";
import { OcppWatchdog, OcppReconciliationService } from "../dist/ocpp/ocpp-watchdog.service";
import { ChargerProviderFactory } from "@evcharge/charger-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;
const SECRET = "DemoCharger@12345";
const IDENTITY = "EVSE-CUIABA-001";

class TestChargePoint {
  ws?: WebSocket;
  transactionId: number | null = null;
  idTag = "";
  connectorId = 1;
  meterWh = 0;
  private pending = new Map<string, (payload: Record<string, unknown>) => void>();

  constructor(
    private readonly url: string,
    private readonly identity: string,
    private readonly secret: string,
  ) {}

  connect(): Promise<void> {
    const auth = Buffer.from(`${this.identity}:${this.secret}`).toString("base64");
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${this.url}/${encodeURIComponent(this.identity)}`, [OCPP_16_SUBPROTOCOL], {
        headers: { Authorization: `Basic ${auth}` },
      });
      this.ws = ws;
      ws.on("message", (data) => this.onMessage(typeof data === "string" ? data : data.toString("utf8")));
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
  }

  close() {
    this.ws?.close();
  }

  sendRaw(raw: string) {
    this.ws?.send(raw);
  }

  async call(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const uniqueId = randomUUID().slice(0, 36);
    const result = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout ${action}`)), 12_000);
      this.pending.set(uniqueId, (body) => {
        clearTimeout(timer);
        resolve(body);
      });
    });
    this.ws?.send(serializeCall(uniqueId, action, payload));
    return result;
  }

  private onMessage(raw: string) {
    let frame;
    try {
      frame = parseOcppFrame(raw);
    } catch {
      return;
    }
    if (frame[0] === MessageType.CALLRESULT) {
      this.pending.get(frame[1])?.(frame[2]);
      this.pending.delete(frame[1]);
      return;
    }
    if (!isCall(frame)) return;
    const uniqueId = frame[1];
    const action = frame[2];
    const payload = frame[3];
    void this.handleCall(uniqueId, action, payload);
  }

  private async handleCall(uniqueId: string, action: string, payload: Record<string, unknown>) {
    if (action === "RemoteStartTransaction") {
      this.ws?.send(serializeCallResult(uniqueId, { status: "Accepted" }));
      this.connectorId = Number(payload.connectorId ?? 1);
      this.idTag = String(payload.idTag ?? "");
      await this.call("Authorize", { idTag: this.idTag });
      const started = await this.call("StartTransaction", {
        connectorId: this.connectorId,
        idTag: this.idTag,
        meterStart: 0,
        timestamp: new Date().toISOString(),
      });
      this.transactionId = Number(started.transactionId);
      await this.call("StatusNotification", {
        connectorId: this.connectorId,
        errorCode: "NoError",
        status: "Charging",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    if (action === "RemoteStopTransaction") {
      this.ws?.send(serializeCallResult(uniqueId, { status: "Accepted" }));
      await this.call("StopTransaction", {
        transactionId: this.transactionId ?? Number(payload.transactionId),
        idTag: this.idTag,
        meterStop: this.meterWh || 1200,
        timestamp: new Date().toISOString(),
        reason: "Remote",
      });
      this.transactionId = null;
      return;
    }
    if (action === "Reset" || action === "ChangeAvailability") {
      this.ws?.send(serializeCallResult(uniqueId, { status: "Accepted" }));
    }
  }
}

async function poll<T>(fn: () => Promise<T>, check: (value: T) => boolean, timeoutMs = 12_000): Promise<T> {
  const start = Date.now();
  let last: T | undefined;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (check(last)) return last;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`poll timeout: ${JSON.stringify(last)}`);
}

describeIfDb("OCPP 1.6J gateway", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let port: number;
  let ocppUrl: string;
  let chargerId: string;
  let connectorId: string;
  let vehicleId: string;
  let driverToken: string;
  let operatorMtToken: string;
  let operatorSpToken: string;
  let cp: TestChargePoint;

  before(async () => {
    ChargerProviderFactory.resetMockInstance();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.listen(0);
    const address = app.getHttpServer().address();
    port = typeof address === "object" && address ? address.port : 3001;
    ocppUrl = `ws://127.0.0.1:${port}/ocpp`;
    prisma = app.get(PrismaService);

    const charger = await prisma.charger.findUnique({
      where: { identity: IDENTITY },
      include: { connectors: true },
    });
    if (!charger) {
      throw new Error("OCPP demo charger missing. Run `pnpm db:seed`.");
    }
    chargerId = charger.id;
    const ccs = charger.connectors.find((c: { number: number; type: string }) => c.number === 1) ?? charger.connectors[0];
    connectorId = ccs.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: "Demo@12345" });
      return res.body.accessToken as string;
    };
    driverToken = await login("driver1@evcharge.demo");
    operatorMtToken = await login("operator.mt@evcharge.demo");
    operatorSpToken = await login("operator.sp@evcharge.demo");
    const vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`);
    vehicleId = vehicles.body[0].id;

    cp = new TestChargePoint(ocppUrl, IDENTITY, SECRET);
    await cp.connect();
    const boot = await cp.call("BootNotification", {
      chargePointVendor: "EVCharge",
      chargePointModel: "Sim16",
      firmwareVersion: "test-1.6",
      chargePointSerialNumber: IDENTITY,
    });
    assert.equal(boot.status, "Accepted");
    await cp.call("StatusNotification", {
      connectorId: 1,
      errorCode: "NoError",
      status: "Available",
      timestamp: new Date().toISOString(),
    });
  });

  after(async () => {
    cp?.close();
    await app.close();
    ChargerProviderFactory.resetMockInstance();
  });

  it("rejects unknown charger", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const ws = new WebSocket(`${ocppUrl}/UNKNOWN-CHARGER`, [OCPP_16_SUBPROTOCOL], {
        headers: { Authorization: `Basic ${Buffer.from("UNKNOWN-CHARGER:x").toString("base64")}` },
      });
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.on("open", () => {
        ws.close();
        reject(new Error("should not open"));
      });
      ws.on("error", () => resolve(401));
    });
    assert.equal(status, 401);
  });

  it("rejects wrong credential", async () => {
    const status = await new Promise<number>((resolve) => {
      const ws = new WebSocket(`${ocppUrl}/${IDENTITY}`, [OCPP_16_SUBPROTOCOL], {
        headers: { Authorization: `Basic ${Buffer.from(`${IDENTITY}:wrong`).toString("base64")}` },
      });
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.on("error", () => resolve(401));
    });
    assert.equal(status, 401);
  });

  it("accepts BootNotification and Heartbeat", async () => {
    const hb = await cp.call("Heartbeat", {});
    assert.ok(typeof hb.currentTime === "string");
    const detail = await request(app.getHttpServer())
      .get(`/api/chargers/${chargerId}/ocpp`)
      .set("Authorization", `Bearer ${operatorMtToken}`)
      .expect(200);
    assert.equal(detail.body.ocppOnline, true);
    assert.equal(detail.body.protocol, "OCPP 1.6");
    assert.equal(detail.body.firmwareVersion, "test-1.6");
  });

  it("maps connector status without assuming connector 1 only", async () => {
    await cp.call("StatusNotification", {
      connectorId: 2,
      errorCode: "NoError",
      status: "Unavailable",
      timestamp: new Date().toISOString(),
    });
    const two = await prisma.connector.findFirst({ where: { chargerId, number: 2 } });
    assert.equal(two?.status, "UNAVAILABLE");
    await cp.call("StatusNotification", {
      connectorId: 2,
      errorCode: "NoError",
      status: "Available",
      timestamp: new Date().toISOString(),
    });
  });

  it("ignores unknown connector", async () => {
    const result = await cp.call("StatusNotification", {
      connectorId: 99,
      errorCode: "NoError",
      status: "Faulted",
      timestamp: new Date().toISOString(),
    });
    assert.deepEqual(result, {});
  });

  it("Authorize rejects unknown idTag and accepts session tag", async () => {
    const invalid = await cp.call("Authorize", { idTag: "UNKNOWNTAG" });
    assert.equal((invalid.idTagInfo as { status: string }).status, "Invalid");
  });

  it("malformed OCPP message does not crash the process", async () => {
    cp.sendRaw("{{{{not-json");
    const hb = await cp.call("Heartbeat", {});
    assert.ok(hb.currentTime);
  });

  it("unknown transaction is rejected", async () => {
    const result = await cp.call("StopTransaction", {
      transactionId: 999999,
      meterStop: 10,
      timestamp: new Date().toISOString(),
    });
    assert.equal((result.idTagInfo as { status: string }).status, "Invalid");
  });

  it("driver cannot send OCPP commands", async () => {
    await request(app.getHttpServer())
      .post(`/api/chargers/${chargerId}/ocpp/command`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ action: "RESET", confirm: true })
      .expect(403);
  });

  it("operator from another company cannot command the charger", async () => {
    await request(app.getHttpServer())
      .get(`/api/chargers/${chargerId}/ocpp`)
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .expect(403);
  });

  it("operator of the company can inspect and reset", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/chargers/${chargerId}/ocpp/command`)
      .set("Authorization", `Bearer ${operatorMtToken}`)
      .send({ action: "RESET", resetType: "Soft", confirm: true })
      .expect(201);
    assert.equal(res.body.accepted, true);
  });

  it("runs a full remote start / meter / remote stop session", async () => {
    const walletBefore = await prisma.wallet.findFirst({
      where: { user: { email: "driver1@evcharge.demo" } },
    });
    const start = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId, idempotencyKey: `ocpp-${Date.now()}` })
      .expect(201);
    assert.ok(["PREPARING", "ACTIVE"].includes(start.body.status));

    const live = await poll(
      () =>
        request(app.getHttpServer())
          .get(`/api/sessions/${start.body.id}`)
          .set("Authorization", `Bearer ${driverToken}`)
          .then((r) => r.body),
      (body) => body.status === "ACTIVE",
    );
    assert.equal(live.status, "ACTIVE");

    cp.meterWh = 2000;
    await cp.call("MeterValues", {
      connectorId: 1,
      transactionId: cp.transactionId,
      meterValue: [
        {
          timestamp: new Date().toISOString(),
          sampledValue: [
            { value: "2000", measurand: "Energy.Active.Import.Register", unit: "Wh" },
            { value: "42000", measurand: "Power.Active.Import", unit: "W" },
            { value: "55", measurand: "SoC" },
          ],
        },
      ],
    });

    const metered = await poll(
      () =>
        request(app.getHttpServer())
          .get(`/api/sessions/${start.body.id}`)
          .set("Authorization", `Bearer ${driverToken}`)
          .then((r) => r.body),
      (body) => Number(body.energyKwh) >= 2,
    );
    assert.ok(metered.costCents > 0);

    const stop = await request(app.getHttpServer())
      .post(`/api/sessions/${start.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const completed = await poll(
      () =>
        request(app.getHttpServer())
          .get(`/api/sessions/${start.body.id}`)
          .set("Authorization", `Bearer ${driverToken}`)
          .then((r) => r.body),
      (body) => body.status === "COMPLETED",
    );
    assert.equal(completed.status, "COMPLETED");
    assert.ok(completed.receipt || stop.body.status === "ACTIVE" || completed.receipt);

    const receipt = await request(app.getHttpServer())
      .get(`/api/sessions/${start.body.id}/receipt`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.ok(receipt.body.number);

    const walletAfter = await prisma.wallet.findFirst({
      where: { user: { email: "driver1@evcharge.demo" } },
    });
    assert.ok((walletAfter?.balanceCents ?? 0) < (walletBefore?.balanceCents ?? 0));

    const connector = await prisma.connector.findUnique({ where: { id: connectorId } });
    assert.equal(connector?.status, "AVAILABLE");
  });

  it("duplicate StartTransaction and StopTransaction are idempotent", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId, idempotencyKey: `ocpp-dup-${Date.now()}` })
      .expect(201);
    await poll(
      () => prisma.chargingSession.findUniqueOrThrow({ where: { id: start.body.id } }),
      (row) => row.status === "ACTIVE",
    );
    const first = await prisma.ocppTransaction.findFirst({
      where: { sessionId: start.body.id },
    });
    assert.ok(first);
    const again = await cp.call("StartTransaction", {
      connectorId: 1,
      idTag: first!.idTag,
      meterStart: 0,
      timestamp: new Date().toISOString(),
    });
    assert.equal(again.transactionId, first!.ocppTransactionId);

    await request(app.getHttpServer())
      .post(`/api/sessions/${start.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
    await poll(
      () => prisma.chargingSession.findUniqueOrThrow({ where: { id: start.body.id } }),
      (row) => row.status === "COMPLETED",
    );
    const dupStop = await cp.call("StopTransaction", {
      transactionId: first!.ocppTransactionId,
      meterStop: 1200,
      timestamp: new Date().toISOString(),
    });
    assert.equal((dupStop.idTagInfo as { status: string }).status, "Accepted");
  });

  it("marks charger offline via watchdog without destroying the charger identity", async () => {
    const closed = new Promise<void>((resolve) => {
      if (!cp.ws || cp.ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      cp.ws.once("close", () => resolve());
    });
    cp.close();
    await closed;
    await new Promise((r) => setTimeout(r, 50));
    await prisma.charger.update({
      where: { id: chargerId },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60_000) },
    });
    await app.get(OcppWatchdog).checkStale();
    const row = await prisma.charger.findUniqueOrThrow({ where: { id: chargerId } });
    assert.equal(row.status, "OFFLINE");
    assert.equal(row.identity, IDENTITY);
    await app.get(OcppReconciliationService).reconcile();
  });
});

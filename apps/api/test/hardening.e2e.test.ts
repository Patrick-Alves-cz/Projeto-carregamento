import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { io, type Socket } from "socket.io-client";
import { SessionStatus, SessionStopReason } from "@prisma/client";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";
import { SessionsService } from "../dist/sessions/sessions.service";
import { WalletService } from "../dist/wallet/wallet.service";
import { ChargerProviderFactory } from "@evcharge/charger-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describeIfDb("Phase 2.1 hardening", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessionsService: SessionsService;
  let walletService: WalletService;
  let serverUrl: string;

  let driverToken: string;
  let driverRefresh: string;
  let driver2Token: string;
  let operatorRjToken: string;
  let vehicleCcs2Id: string;
  let vehicleType2Id: string;
  let ccs2ConnectorId: string;
  let type2ConnectorId: string;
  let driverUserId: string;

  before(async () => {
    ChargerProviderFactory.resetMockInstance();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === "object" && address ? address.port : 3001;
    serverUrl = `http://127.0.0.1:${port}`;

    prisma = app.get(PrismaService);
    sessionsService = app.get(SessionsService);
    walletService = app.get(WalletService);

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: "Demo@12345" })
        .expect(201);
      return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
    };

    const d1 = await login("driver1@evcharge.demo");
    driverToken = d1.accessToken;
    driverRefresh = d1.refreshToken;
    driverUserId = d1.user.id;

    const d2 = await login("driver2@evcharge.demo");
    driver2Token = d2.accessToken;

    operatorRjToken = (await login("operator.rj@evcharge.demo")).accessToken;

    const vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`);
    vehicleCcs2Id = vehicles.body[0].id;

    const driver3 = await login("driver3@evcharge.demo");
    const vehicles3 = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driver3.accessToken}`);
    vehicleType2Id = vehicles3.body[0].id;

    const stations = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${driverToken}`);
    const paulista = stations.body.find((s: { name: string }) => s.name.includes("Paulista"));
    const shopping = stations.body.find((s: { name: string }) => s.name.includes("Shopping"));
    ccs2ConnectorId = paulista.chargers[0].connectors.find(
      (c: { status: string; type: string }) => c.status === "AVAILABLE" && c.type === "CCS2",
    ).id;
    type2ConnectorId = shopping.chargers[0].connectors.find(
      (c: { status: string; type: string }) => c.status === "AVAILABLE" && c.type === "TYPE2",
    ).id;
  });

  after(async () => {
    await prisma.chargingSession.deleteMany({
      where: { user: { email: { endsWith: "@evcharge.demo" } } },
    });
    await prisma.connector.updateMany({
      where: {
        charger: { status: { notIn: ["OFFLINE", "FAULTED"] } },
        status: { in: ["PREPARING", "CHARGING", "SUSPENDED", "FINISHING"] },
      },
      data: { status: "AVAILABLE" },
    });
    await prisma.connector.updateMany({
      where: { charger: { status: "OFFLINE" } },
      data: { status: "UNAVAILABLE" },
    });
    await prisma.charger.updateMany({
      where: { status: { in: ["PREPARING", "CHARGING", "SUSPENDED", "FINISHING"] } },
      data: { status: "AVAILABLE" },
    });
    await app.close();
    ChargerProviderFactory.resetMockInstance();
  });

  it("driver cannot register as admin", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({
        email: `admin.try.${Date.now()}@example.com`,
        password: "TestPass123",
        fullName: "Nope",
        role: "ADMIN",
      })
      .expect(400);
    assert.equal(res.body.code, "VALIDATION_ERROR");
  });

  it("auth/me does not return document", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(res.body.profile?.document, undefined);
  });

  it("driver cannot access admin live sessions", async () => {
    await request(app.getHttpServer())
      .get("/api/sessions/active/live")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);
  });

  it("operator cannot access another company", async () => {
    const companies = await prisma.company.findMany();
    const sp = companies.find((c) => c.slug.includes("sp") || c.name.toLowerCase().includes("paulo"));
    const target = sp ?? companies[0];
    assert.ok(target);
    await request(app.getHttpServer())
      .get(`/api/companies/${target.id}`)
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(403);
  });

  it("blocks CCS2 vehicle on TYPE2 connector and allows CCS2 on CCS2", async () => {
    const blocked = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: type2ConnectorId, vehicleId: vehicleCcs2Id })
      .expect(400);
    assert.equal(blocked.body.message, "Veículo incompatível com este conector.");

    const allowed = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id })
      .expect(201);
    assert.equal(allowed.body.status, "ACTIVE");
    await request(app.getHttpServer())
      .post(`/api/sessions/${allowed.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ idempotencyKey: `stop-${allowed.body.id}` })
      .expect(201);
  });

  it("allows TYPE2 vehicle on TYPE2 connector", async () => {
    const driver3 = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver3@evcharge.demo", password: "Demo@12345" });
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driver3.body.accessToken}`)
      .send({ connectorId: type2ConnectorId, vehicleId: vehicleType2Id })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driver3.body.accessToken}`)
      .send({})
      .expect(201);
  });

  it("rejects simultaneous start on the same connector", async () => {
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/sessions/start")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id }),
      request(app.getHttpServer())
        .post("/api/sessions/start")
        .set("Authorization", `Bearer ${driver2Token}`)
        .send({
          connectorId: ccs2ConnectorId,
          vehicleId: (
            await request(app.getHttpServer())
              .get("/api/vehicles")
              .set("Authorization", `Bearer ${driver2Token}`)
          ).body[0].id,
        }),
    ]);

    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [201, 409]);
    const winnerId = first.status === 201 ? first.body.id : second.body.id;
    const winnerToken = first.status === 201 ? driverToken : driver2Token;
    await request(app.getHttpServer())
      .post(`/api/sessions/${winnerId}/stop`)
      .set("Authorization", `Bearer ${winnerToken}`)
      .send({})
      .expect(201);
  });

  it("wallet concurrent debit never goes negative", async () => {
    const wallet = await walletService.getOrCreateWallet(driverUserId);
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: 1000 },
    });

    const results = await Promise.allSettled([
      prisma.$transaction((tx) =>
        walletService.debitForSession(tx, {
          userId: driverUserId,
          amountCents: 800,
          description: "concurrent a",
          idempotencyKey: `concurrent-a-${Date.now()}`,
        }),
      ),
      prisma.$transaction((tx) =>
        walletService.debitForSession(tx, {
          userId: driverUserId,
          amountCents: 800,
          description: "concurrent b",
          idempotencyKey: `concurrent-b-${Date.now()}`,
        }),
      ),
    ]);

    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    assert.ok(after.balanceCents >= 0);
    assert.ok(after.balanceCents <= 200);
    const rejected = results.filter((r) => r.status === "rejected");
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    await prisma.wallet.update({
      where: { userId: driverUserId },
      data: { balanceCents: 10000 },
    });
  });

  it("start is idempotent for the same key", async () => {
    const key = `start-idem-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id, idempotencyKey: key })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id, idempotencyKey: key })
      .expect(201);
    assert.equal(first.body.id, second.body.id);

    await request(app.getHttpServer())
      .post(`/api/sessions/${first.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ idempotencyKey: `stop-${first.body.id}` })
      .expect(201);
  });

  it("stop is idempotent for the same key", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id })
      .expect(201);
    const stopKey = `stop-idem-${started.body.id}`;
    const first = await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ idempotencyKey: stopKey })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ idempotencyKey: stopKey })
      .expect(201);
    assert.equal(first.body.id, second.body.id);
    assert.equal(second.body.status, "COMPLETED");
  });

  it("pause stops metering and resume restarts it", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/pause`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const paused = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    const pausedEnergy = Number(paused.body.energyKwh);
    const pausedCost = Number(paused.body.costCents);
    await wait(3500);
    const stillPaused = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(Number(stillPaused.body.energyKwh), pausedEnergy);
    assert.equal(Number(stillPaused.body.costCents), pausedCost);
    assert.equal(Number(stillPaused.body.currentPowerKw ?? 0), 0);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/resume`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
    await wait(3500);
    const resumed = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.ok(Number(resumed.body.energyKwh) > pausedEnergy);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({})
      .expect(201);
  });

  it("reconciles orphan PENDING/PREPARING sessions", async () => {
    const connector = await prisma.connector.findUniqueOrThrow({ where: { id: ccs2ConnectorId } });
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleCcs2Id } });
    const tariff = await prisma.tariff.findFirstOrThrow({
      where: { companyId: (await prisma.charger.findUniqueOrThrow({
        where: { id: connector.chargerId },
        include: { station: true },
      })).station.companyId, active: true },
    });

    await prisma.connector.update({
      where: { id: connector.id },
      data: { status: "PREPARING" },
    });

    const orphan = await prisma.chargingSession.create({
      data: {
        userId: driverUserId,
        vehicleId: vehicle.id,
        connectorId: connector.id,
        tariffId: tariff.id,
        tariffSnapshot: {
          id: tariff.id,
          name: tariff.name,
          pricePerKwhCents: tariff.pricePerKwhCents,
          minBalanceCents: tariff.minBalanceCents,
          currency: tariff.currency,
        },
        status: SessionStatus.PREPARING,
        createdAt: new Date(Date.now() - 120_000),
      },
    });

    const count = await sessionsService.reconcileOrphanSessions(30_000);
    assert.ok(count >= 1);
    const updated = await prisma.chargingSession.findUniqueOrThrow({ where: { id: orphan.id } });
    assert.equal(updated.status, SessionStatus.FAILED);
    assert.equal(updated.stopReason, SessionStopReason.TIMEOUT);
    const released = await prisma.connector.findUniqueOrThrow({ where: { id: connector.id } });
    assert.equal(released.status, "AVAILABLE");
  });

  it("detects refresh token reuse and revokes the family", async () => {
    const refreshed = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: driverRefresh })
      .expect(201);
    assert.ok(refreshed.body.accessToken);
    const reuse = await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: driverRefresh })
      .expect(401);
    assert.match(String(reuse.body.message), /reuse/i);
    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver1@evcharge.demo", password: "Demo@12345" })
      .expect(201);
    driverToken = login.body.accessToken;
    driverRefresh = login.body.refreshToken;
  });

  it("does not broadcast session events across websocket tenants", async () => {
    const connect = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = io(`${serverUrl}/realtime`, {
          auth: { token },
          transports: ["websocket"],
          forceNew: true,
        });
        socket.on("connect", () => resolve(socket));
        socket.on("connect_error", reject);
      });

    const driver2Socket = await connect(driver2Token);
    const operatorRjSocket = await connect(operatorRjToken);
    const leaked: string[] = [];
    driver2Socket.on("session.started", () => leaked.push("driver2"));
    driver2Socket.on("session.event", () => leaked.push("driver2-event"));
    operatorRjSocket.on("operations.event", () => leaked.push("rj"));
    operatorRjSocket.on("session.started", () => leaked.push("rj-started"));

    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: ccs2ConnectorId, vehicleId: vehicleCcs2Id })
      .expect(201);

    await wait(800);
    driver2Socket.disconnect();
    operatorRjSocket.disconnect();
    assert.equal(leaked.length, 0);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({})
      .expect(201);
  });
});

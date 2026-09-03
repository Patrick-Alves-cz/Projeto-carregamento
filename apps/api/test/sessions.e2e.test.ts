import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";
import { ChargerProviderFactory } from "@evcharge/charger-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Charging Sessions E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let driverToken: string;
  let driver2Token: string;
  let operatorSpToken: string;
  let vehicleId: string;
  let driver2VehicleId: string;
  let connectorId: string;

  before(async () => {
    ChargerProviderFactory.resetMockInstance();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();

    prisma = app.get(PrismaService);

    const demoUser = await prisma.user.findUnique({
      where: { email: "driver1@evcharge.demo" },
    });
    if (!demoUser) {
      throw new Error("Demo seed missing. Run `pnpm db:seed` before API E2E tests.");
    }

    await prisma.connector.updateMany({
      where: { charger: { status: "OFFLINE" } },
      data: { status: "UNAVAILABLE" },
    });

    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver1@evcharge.demo", password: "Demo@12345" });
    driverToken = login.body.accessToken;

    const login2 = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver2@evcharge.demo", password: "Demo@12345" });
    driver2Token = login2.body.accessToken;

    const operator = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "operator.sp@evcharge.demo", password: "Demo@12345" });
    operatorSpToken = operator.body.accessToken;

    const vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`);
    vehicleId = vehicles.body[0].id;

    const vehicles2 = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driver2Token}`);
    driver2VehicleId = vehicles2.body[0].id;

    const stations = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${driverToken}`);
    const spStation = stations.body.find((s: { name: string }) => s.name.includes("Paulista"));
    connectorId = spStation.chargers[0].connectors.find(
      (c: { status: string }) => c.status === "AVAILABLE",
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

  it("starts a charging session", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId })
      .expect(201);

    assert.equal(res.body.status, "ACTIVE");
    assert.ok(res.body.id);
    assert.ok(res.body.startedAt);

    const sessionId = res.body.id;

    await new Promise((r) => setTimeout(r, 3500));

    const detail = await request(app.getHttpServer())
      .get(`/api/sessions/${sessionId}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(Number(detail.body.energyKwh) > 0);
    assert.ok(Number(detail.body.costCents) >= 0);

    const stop = await request(app.getHttpServer())
      .post(`/api/sessions/${sessionId}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    assert.equal(stop.body.status, "COMPLETED");
    assert.ok(stop.body.endedAt);
    assert.ok(stop.body.costCents >= 0);

    const connector = await prisma.connector.findUnique({ where: { id: connectorId } });
    assert.equal(connector?.status, "AVAILABLE");
  });

  it("rejects starting an occupied connector", async () => {
    const first = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId })
      .expect(201);

    const second = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driver2Token}`)
      .send({ connectorId, vehicleId: driver2VehicleId })
      .expect(409);

    assert.match(String(second.body.message), /indispon|reservado|ocupado/i);

    await request(app.getHttpServer())
      .post(`/api/sessions/${first.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
  });

  it("rejects offline connector", async () => {
    const offlineConnector = await prisma.connector.findFirst({
      where: {
        type: "CCS2",
        charger: { status: { in: ["OFFLINE", "FAULTED"] } },
      },
    });
    assert.ok(offlineConnector);

    await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: offlineConnector!.id, vehicleId })
      .expect(409);
  });

  it("blocks driver from accessing another user's session", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
  });

  it("allows operator to list active sessions for their company", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId })
      .expect(201);

    const live = await request(app.getHttpServer())
      .get("/api/sessions/active/live")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .expect(200);

    assert.ok(Array.isArray(live.body));
    assert.ok(live.body.some((s: { id: string }) => s.id === started.body.id));

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
  });

  it("calculates cost from energy and tariff", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId })
      .expect(201);

    await new Promise((r) => setTimeout(r, 4000));

    const stopped = await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const energy = Number(stopped.body.energyKwh);
    const expected = Math.round(energy * 189);
    assert.ok(stopped.body.costCents >= 0);
    if (energy > 0) {
      assert.ok(Math.abs(stopped.body.costCents - expected) <= 1);
    }
  });
});

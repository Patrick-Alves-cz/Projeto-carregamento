import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ChargerProviderFactory } from "@evcharge/charger-provider";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Phase 2.2 discovery", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken: string;
  let driver2Token: string;
  let operatorSpToken: string;
  let operatorRjToken: string;
  let vehicleCcs2Id: string;
  let vehicleType2Id: string;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: "Demo@12345" })
      .expect(201);
    return res.body as { accessToken: string; user: { id: string } };
  };

  before(async () => {
    ChargerProviderFactory.resetMockInstance();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    await app.listen(0);

    prisma = app.get(PrismaService);

    driverToken = (await login("driver1@evcharge.demo")).accessToken;
    driver2Token = (await login("driver2@evcharge.demo")).accessToken;
    operatorSpToken = (await login("operator.sp@evcharge.demo")).accessToken;
    operatorRjToken = (await login("operator.rj@evcharge.demo")).accessToken;

    const vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    vehicleCcs2Id = vehicles.body[0].id;

    const type2Vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(200);
    const d3 = await login("driver3@evcharge.demo");
    const type2List = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${d3.accessToken}`)
      .expect(200);
    vehicleType2Id = type2List.body[0].id;
    void type2Vehicles;
  });

  after(async () => {
    await app.close();
  });

  it("returns nearby stations around São Paulo", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -23.5614, lng: -46.6559, radiusKm: 10 })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((s: { distanceKm: number }) => s.distanceKm <= 10));
    assert.ok("pricePerKwhCents" in res.body[0]);
    assert.ok("availableConnectors" in res.body[0]);
    assert.equal(typeof res.body[0].reliability.score, "number");
    assert.ok(res.body[0].reliability.score >= 0 && res.body[0].reliability.score <= 100);
    assert.ok(!("chargers" in res.body[0]));
  });

  it("filters nearby by connector type", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -23.55, lng: -46.64, radiusKm: 20, connectorType: "TYPE2" })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(res.body.length >= 1);
    for (const station of res.body) {
      const full = await request(app.getHttpServer())
        .get(`/api/stations/${station.id}`)
        .set("Authorization", `Bearer ${driverToken}`)
        .expect(200);
      assert.ok(
        full.body.chargers.some((c: { connectors: { type: string }[] }) =>
          c.connectors.some((conn) => conn.type === "TYPE2"),
        ),
      );
    }
  });

  it("filters nearby by minimum power", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -23.55, lng: -46.64, radiusKm: 20, powerMin: 100 })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((s: { maxPowerKw: number }) => s.maxPowerKw >= 100));
  });

  it("filters nearby by availability", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -23.00, lng: -43.32, radiusKm: 15, availability: "true" })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(res.body.every((s: { availableConnectors: number; status: string }) => s.availableConnectors > 0 && s.status === "ACTIVE"));
  });

  it("filters nearby by vehicle compatibility", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -15.6014, lng: -56.0979, radiusKm: 20, vehicleId: vehicleCcs2Id })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(res.body.length >= 1);
    assert.ok(res.body.every((s: { compatible: boolean }) => s.compatible === true));
  });

  it("rejects starting a session with an incompatible vehicle", async () => {
    const type2Station = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -23.55, lng: -46.64, radiusKm: 20, connectorType: "TYPE2", availability: "true" })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    const station = await request(app.getHttpServer())
      .get(`/api/stations/${type2Station.body[0].id}`)
      .query({ vehicleId: vehicleCcs2Id })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    const type2 = station.body.chargers
      .flatMap((c: { connectors: { id: string; type: string; status: string }[] }) => c.connectors)
      .find((c: { type: string; status: string }) => c.type === "TYPE2" && c.status === "AVAILABLE");
    assert.ok(type2);

    const res = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: type2.id, vehicleId: vehicleCcs2Id })
      .expect(400);

    assert.equal(res.body.code, "VALIDATION_ERROR");
    assert.match(res.body.message, /incompat/i);
  });

  it("does not allow charging at a maintenance station", async () => {
    const stations = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    const maintenance = stations.body.find((s: { status: string }) => s.status === "MAINTENANCE");
    assert.ok(maintenance);

    const detail = await request(app.getHttpServer())
      .get(`/api/stations/${maintenance.id}`)
      .query({ vehicleId: vehicleCcs2Id })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    const connector = detail.body.chargers.flatMap(
      (c: { connectors: { id: string; action: string }[] }) => c.connectors,
    )[0];
    assert.equal(connector.action, "MAINTENANCE");
  });

  it("rejects starting on an occupied connector", async () => {
    let occupied = await prisma.connector.findFirst({
      where: {
        type: "CCS2",
        status: { in: ["CHARGING", "PREPARING", "SUSPENDED"] },
      },
    });
    if (!occupied) {
      occupied = await prisma.connector.findFirst({
        where: { type: "CCS2", status: "AVAILABLE" },
      });
      assert.ok(occupied);
      occupied = await prisma.connector.update({
        where: { id: occupied.id },
        data: { status: "CHARGING" },
      });
    }

    const res = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId: occupied.id, vehicleId: vehicleCcs2Id })
      .expect(409);
    assert.equal(res.body.code, "CONNECTOR_UNAVAILABLE");
  });

  it("keeps company isolation on admin station create", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/stations")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .send({
        name: "Estação Isolation 2.2",
        address: "Rua Isolamento, 100 - São Paulo, SP",
        city: "São Paulo",
        latitude: -23.55,
        longitude: -46.63,
        amenities: [],
      })
      .expect(201);

    const rjList = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(200);

    assert.ok(!rjList.body.some((s: { id: string }) => s.id === created.body.id));

    await request(app.getHttpServer())
      .patch(`/api/stations/${created.body.id}`)
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .send({ name: "Hijack" })
      .expect(403);
  });

  it("driver cannot access administrative endpoints", async () => {
    await request(app.getHttpServer())
      .get("/api/chargers")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/stations")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        name: "Estação Driver",
        address: "Rua Driver, 123 - São Paulo, SP",
        latitude: -23.55,
        longitude: -46.63,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/connectors")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);
  });

  it("marks TYPE2 vehicle as incompatible on CCS2 connectors", async () => {
    const cuiaba = await request(app.getHttpServer())
      .get("/api/stations/nearby")
      .query({ lat: -15.6014, lng: -56.0979, radiusKm: 5, q: "EV Station Cuiabá" })
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.ok(cuiaba.body[0]);

    const d3 = await login("driver3@evcharge.demo");
    const detail = await request(app.getHttpServer())
      .get(`/api/stations/${cuiaba.body[0].id}`)
      .query({ vehicleId: vehicleType2Id })
      .set("Authorization", `Bearer ${d3.accessToken}`)
      .expect(200);

    const ccs2 = detail.body.chargers
      .flatMap((c: { connectors: { type: string; compatible: boolean; action: string }[] }) => c.connectors)
      .find((c: { type: string }) => c.type === "CCS2");
    assert.equal(ccs2.compatible, false);
    assert.equal(ccs2.action, "INCOMPATIBLE");
  });
});

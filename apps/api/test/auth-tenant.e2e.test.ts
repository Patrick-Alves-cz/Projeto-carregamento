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

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Auth & Multi-tenant E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let driverToken: string;
  let driver2Token: string;
  let operatorSpToken: string;
  let operatorRjToken: string;
  let driver1VehicleId: string;
  let companySpId: string;

  before(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();

    prisma = app.get(PrismaService);

    // Ensure demo seed data exists for E2E flows
    const demoUser = await prisma.user.findUnique({
      where: { email: "driver1@evcharge.demo" },
    });
    if (!demoUser) {
      throw new Error("Demo seed missing. Run `pnpm db:seed` before API E2E tests.");
    }
  });

  after(async () => {
    await app.close();
  });

  it("login with demo driver", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver1@evcharge.demo", password: "Demo@12345" })
      .expect(201);

    assert.ok(res.body.accessToken);
    driverToken = res.body.accessToken;
  });

  it("login with second driver", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "driver2@evcharge.demo", password: "Demo@12345" })
      .expect(201);
    driver2Token = res.body.accessToken;
  });

  it("login with operators", async () => {
    const sp = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "operator.sp@evcharge.demo", password: "Demo@12345" })
      .expect(201);
    operatorSpToken = sp.body.accessToken;

    const rj = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "operator.rj@evcharge.demo", password: "Demo@12345" })
      .expect(201);
    operatorRjToken = rj.body.accessToken;
  });

  it("protected route rejects unauthenticated access", async () => {
    await request(app.getHttpServer()).get("/api/auth/me").expect(401);
  });

  it("auth/me returns current user", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.equal(res.body.email, "driver1@evcharge.demo");
    assert.equal(res.body.role, "DRIVER");
  });

  it("driver accesses own vehicle", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);

    assert.ok(list.body.length >= 1);
    driver1VehicleId = list.body[0].id;

    await request(app.getHttpServer())
      .get(`/api/vehicles/${driver1VehicleId}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
  });

  it("driver cannot access another driver's vehicle", async () => {
    await request(app.getHttpServer())
      .get(`/api/vehicles/${driver1VehicleId}`)
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(403);
  });

  it("operator can list own company stations", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .expect(200);

    assert.ok(res.body.length >= 1);
    companySpId = res.body[0].companyId;
    assert.ok(res.body.every((s: { companyId: string }) => s.companyId === companySpId));
  });

  it("operator cannot access another company", async () => {
    await request(app.getHttpServer())
      .get(`/api/companies/${companySpId}`)
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(403);
  });

  it("operator can create station", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/stations")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .send({
        name: "Estação Teste API",
        address: "Rua Teste, 123 - São Paulo, SP",
        latitude: -23.55,
        longitude: -46.63,
        amenities: [],
      })
      .expect(201);

    assert.equal(res.body.name, "Estação Teste API");
  });

  it("operator can create charger and connector", async () => {
    const stations = await request(app.getHttpServer())
      .get("/api/stations")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .expect(200);

    const stationId = stations.body[0].id;

    const charger = await request(app.getHttpServer())
      .post("/api/chargers")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .send({
        stationId,
        serialNumber: `TEST-${Date.now()}`,
        maxPowerKw: 50,
        model: "Test",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/connectors")
      .set("Authorization", `Bearer ${operatorSpToken}`)
      .send({
        chargerId: charger.body.id,
        number: 9,
        type: "CCS2",
        maxPowerKw: 50,
      })
      .expect(201);
  });

  it("register creates driver account", async () => {
    const email = `test.driver.${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({
        email,
        password: "TestPass123",
        fullName: "Test Driver",
        role: "DRIVER",
      })
      .expect(201);

    assert.equal(res.body.user.email, email);

    await prisma.user.delete({ where: { email } });
  });
});

describe("TenantAccessService unit behavior", () => {
  it("placeholder when no database configured", () => {
    if (!hasDatabase) assert.ok(true);
  });
});

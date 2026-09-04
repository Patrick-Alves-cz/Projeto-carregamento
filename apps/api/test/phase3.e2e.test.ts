import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ConnectorStatus } from "@prisma/client";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";
import { ChargerProviderFactory } from "@evcharge/charger-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Phase 3 MVP closure", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken: string;
  let driver2Token: string;
  let driverUserId: string;
  let driverRefresh: string;
  let adminToken: string;
  let operatorToken: string;
  let companyId: string;
  let vehicleId: string;
  let connectorId: string;

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
    driver2Token = (await login("driver2@evcharge.demo")).accessToken;
    adminToken = (await login("admin.sp@evcharge.demo")).accessToken;
    operatorToken = (await login("operator.sp@evcharge.demo")).accessToken;

    const me = await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    companyId = me.body.companies[0].id;

    const vehicles = await request(app.getHttpServer())
      .get("/api/vehicles")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    vehicleId = vehicles.body[0].id;

    const connector = await prisma.connector.findFirst({
      where: {
        type: "CCS2",
        status: ConnectorStatus.AVAILABLE,
        charger: { station: { companyId }, status: "AVAILABLE" },
      },
    });
    assert.ok(connector);
    connectorId = connector.id;
  });

  after(async () => {
    await app.close();
  });

  it("wallet get is driver-only and isolated", async () => {
    const mine = await request(app.getHttpServer())
      .get("/api/wallet")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(typeof mine.body.balanceCents, "number");

    await request(app.getHttpServer())
      .get("/api/wallet")
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(403);

    const other = await request(app.getHttpServer())
      .get("/api/wallet")
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(200);
    assert.notEqual(mine.body.id, other.body.id);
  });

  it("wallet top-up is DEMO, idempotent and rejects invalid amounts", async () => {
    const key = `topup-test-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post("/api/wallet/top-up")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ amountCents: 2000, idempotencyKey: key })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/wallet/top-up")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ amountCents: 2000, idempotencyKey: key })
      .expect(201);
    assert.equal(first.body.wallet.balanceCents, second.body.wallet.balanceCents);
    assert.equal(second.body.replayed, true);

    await request(app.getHttpServer())
      .post("/api/wallet/top-up")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: -10 })
      .expect(400);
  });

  it("blocks start below minimum balance", async () => {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCents: 200 } });
    const res = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId, idempotencyKey: `minbal-${Date.now()}` })
      .expect(402);
    assert.match(String(res.body.message), /Adicione saldo/i);
    await prisma.wallet.update({ where: { id: wallet.id }, data: { balanceCents: 10000 } });
  });

  it("tariff CRUD is company-scoped and snapshot stays frozen", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/tariffs")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        companyId,
        name: `Tarifa Teste ${Date.now()}`,
        pricePerKwhCents: 250,
        minBalanceCents: 1000,
      })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/tariffs/${created.body.id}`)
      .set("Authorization", `Bearer ${operatorToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/tariffs/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pricePerKwhCents: 199 })
      .expect(200);

    const rjAdmin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ email: "operator.rj@evcharge.demo", password: "Demo@12345" });
    await request(app.getHttpServer())
      .get(`/api/tariffs/${created.body.id}`)
      .set("Authorization", `Bearer ${rjAdmin.body.accessToken}`)
      .expect(403);

    await prisma.connector.update({
      where: { id: connectorId },
      data: { tariffId: created.body.id },
    });

    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId, idempotencyKey: `snap-${Date.now()}` })
      .expect(201);
    assert.equal(started.body.tariffSnapshot.pricePerKwhCents, 199);

    await request(app.getHttpServer())
      .patch(`/api/tariffs/${created.body.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ pricePerKwhCents: 321 })
      .expect(200);

    const live = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(live.body.tariffSnapshot.pricePerKwhCents, 199);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/pause`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
    const paused = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(paused.body.status, "PAUSED");
    assert.equal(paused.body.currentPowerKw ?? 0, 0);
    const energyPaused = paused.body.energyKwh;

    await new Promise((r) => setTimeout(r, 1200));
    const stillPaused = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(stillPaused.body.energyKwh, energyPaused);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/resume`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const stopped = await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ idempotencyKey: `stop-${started.body.id}` })
      .expect(201);
    assert.equal(stopped.body.status, "COMPLETED");

    const receipt = await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}/receipt`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(receipt.body.payload.paymentMethod, "Carteira DEMO");
    assert.ok(receipt.body.number.startsWith("EV-"));

    await prisma.connector.update({ where: { id: connectorId }, data: { tariffId: null } });
    await prisma.tariff.update({ where: { id: created.body.id }, data: { active: false } });
  });

  it("invitations: create, accept, revoke and driver cannot invite", async () => {
    await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ email: "nobody@example.com", companyId, role: "OPERATOR" })
      .expect(403);

    const created = await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: `invite.${Date.now()}@evcharge.test`, companyId, role: "OPERATOR" })
      .expect(201);
    assert.ok(created.body.token);

    const preview = await request(app.getHttpServer())
      .get(`/api/invitations/${created.body.token}`)
      .expect(200);
    assert.equal(preview.body.role, "OPERATOR");

    const accepted = await request(app.getHttpServer())
      .post(`/api/invitations/${created.body.token}/accept`)
      .send({ fullName: "Novo Operador", password: "Invite@12345" })
      .expect(201);
    assert.equal(accepted.body.user.role, "OPERATOR");

    const second = await request(app.getHttpServer())
      .post("/api/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ email: `revoke.${Date.now()}@evcharge.test`, companyId, role: "ADMIN" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/invitations/${second.body.id}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);
  });

  it("forgot password hides existence and reset invalidates refresh tokens", async () => {
    const unknown = await request(app.getHttpServer())
      .post("/api/auth/forgot-password")
      .send({ email: "missing@example.com" })
      .expect(201);
    const known = await request(app.getHttpServer())
      .post("/api/auth/forgot-password")
      .send({ email: "driver1@evcharge.demo" })
      .expect(201);
    assert.equal(unknown.body.message, known.body.message);
    assert.equal(unknown.body.resetToken, undefined);
    assert.ok(known.body.resetToken);

    await request(app.getHttpServer())
      .post("/api/auth/reset-password")
      .send({ token: known.body.resetToken, password: "Demo@12345" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/auth/refresh")
      .send({ refreshToken: driverRefresh })
      .expect(401);
  });
});

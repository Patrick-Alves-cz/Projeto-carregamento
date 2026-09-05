import { config } from "dotenv";
import { resolve } from "node:path";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { ChargerStatus, ConnectorStatus } from "@prisma/client";

config({ path: resolve(__dirname, "../../../.env") });
config({ path: resolve(__dirname, "../../../packages/database/.env"), override: true });

import { AppModule } from "../dist/app.module";
import { PrismaService } from "../dist/common/database/database.module";
import { ChargerProviderFactory } from "@evcharge/charger-provider";
import { releaseConnector } from "./release-connector";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Phase 5 payments, reservations and waitlist", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken: string;
  let driver2Token: string;
  let driverUserId: string;
  let adminToken: string;
  let operatorRjToken: string;
  let vehicleId: string;
  let stationId: string;
  let connectorId: string;
  let companyId: string;

  before(async () => {
    ChargerProviderFactory.resetMockInstance();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    prisma = app.get(PrismaService);

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({ email, password: "Demo@12345" })
        .expect(201);
      return res.body as { accessToken: string; user: { id: string } };
    };

    const d1 = await login("driver1@evcharge.demo");
    driverToken = d1.accessToken;
    driverUserId = d1.user.id;
    driver2Token = (await login("driver2@evcharge.demo")).accessToken;
    adminToken = (await login("admin.sp@evcharge.demo")).accessToken;
    operatorRjToken = (await login("operator.rj@evcharge.demo")).accessToken;

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
        charger: { status: "AVAILABLE", station: { companyId, status: "ACTIVE" } },
      },
      include: { charger: true },
    });
    assert.ok(connector);
    connectorId = connector.id;
    stationId = connector.charger.stationId;
    await releaseConnector(prisma, connectorId);
    await prisma.wallet.updateMany({
      where: { userId: driverUserId },
      data: { balanceCents: 20_000 },
    });
  });

  after(async () => {
    await app.close();
  });

  it("creates PIX payment idempotently and credits wallet only once", async () => {
    const key = `pay-phase5-${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ amountCents: 2500, kind: "PIX" })
      .expect(201);
    assert.equal(first.body.status, "PENDING");
    assert.equal(first.body.demo, true);
    assert.ok(first.body.pixCopyPaste);

    const replay = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .set("Idempotency-Key", key)
      .send({ amountCents: 2500, kind: "PIX" })
      .expect(201);
    assert.equal(replay.body.id, first.body.id);

    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    await request(app.getHttpServer())
      .post(`/api/payments/${first.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "CONFIRMED" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/payments/${first.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "CONFIRMED" })
      .expect(201);
    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    assert.equal(after.balanceCents, before.balanceCents + 2500);
  });

  it("ignores duplicate webhooks and out-of-order confirms", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1500, kind: "PIX" })
      .expect(201);

    const eventId = `wh-${created.body.id}`;
    const body = {
      eventId,
      eventType: "payment.confirmed",
      paymentId: created.body.id,
      status: "CONFIRMED",
    };
    const first = await request(app.getHttpServer()).post("/api/payments/webhooks/mock").send(body).expect(201);
    const second = await request(app.getHttpServer()).post("/api/payments/webhooks/mock").send(body).expect(201);
    assert.equal(second.body.replayed, true);
    assert.equal(first.body.paymentId, created.body.id);

    const expired = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1200, kind: "PIX" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/payments/${expired.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "EXPIRED" })
      .expect(201);
    const ignored = await request(app.getHttpServer())
      .post("/api/payments/webhooks/mock")
      .send({
        eventId: `late-${expired.body.id}`,
        eventType: "payment.confirmed",
        paymentId: expired.body.id,
        status: "CONFIRMED",
      })
      .expect(201);
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: expired.body.id } });
    assert.equal(row.status, "EXPIRED");
    assert.equal(row.walletCredited, false);
    assert.equal(ignored.body.status ?? row.status, "EXPIRED");
  });

  it("rejects reservation conflicts, offline and faulted connectors", async () => {
    const connector = await prisma.connector.findUniqueOrThrow({
      where: { id: connectorId },
      include: { charger: true },
    });
    await prisma.maintenanceWindow.updateMany({
      where: {
        status: { in: ["ACTIVE", "SCHEDULED"] },
        OR: [{ stationId: connector.charger.stationId }, { chargerId: connector.chargerId }, { connectorId }],
      },
      data: { status: "CANCELLED" },
    });
    await prisma.reservation.updateMany({
      where: { connectorId, status: { in: ["PENDING", "CONFIRMED", "ACTIVE"] } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await prisma.charger.update({
      where: { id: connector.chargerId },
      data: { status: ChargerStatus.AVAILABLE },
    });
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: ConnectorStatus.AVAILABLE },
    });
    const startAt = new Date(Date.now() + 20 * 60_000).toISOString();
    const endAt = new Date(Date.now() + 80 * 60_000).toISOString();
    const created = await request(app.getHttpServer())
      .post("/api/reservations")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ stationId, connectorId, vehicleId, startAt, endAt })
      .expect(201);
    assert.equal(created.body.status, "CONFIRMED");

    await request(app.getHttpServer())
      .post("/api/reservations")
      .set("Authorization", `Bearer ${driver2Token}`)
      .send({
        stationId,
        connectorId,
        vehicleId: (
          await request(app.getHttpServer())
            .get("/api/vehicles")
            .set("Authorization", `Bearer ${driver2Token}`)
            .expect(200)
        ).body[0].id,
        startAt,
        endAt,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/api/reservations/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const offline = await prisma.connector.findFirst({
      where: { charger: { status: ChargerStatus.OFFLINE, station: { companyId } } },
    });
    if (offline) {
      await request(app.getHttpServer())
        .post("/api/reservations")
        .set("Authorization", `Bearer ${driverToken}`)
        .send({
          stationId: (await prisma.charger.findUniqueOrThrow({ where: { id: offline.chargerId } })).stationId,
          connectorId: offline.id,
          vehicleId,
          startAt: new Date(Date.now() + 90 * 60_000).toISOString(),
          endAt: new Date(Date.now() + 140 * 60_000).toISOString(),
        })
        .expect(400);
    }

    const original = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });
    await prisma.connector.update({ where: { id: connectorId }, data: { status: ConnectorStatus.FAULTED } });
    await request(app.getHttpServer())
      .post("/api/reservations")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        stationId,
        connectorId,
        vehicleId,
        startAt: new Date(Date.now() + 150 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 200 * 60_000).toISOString(),
      })
      .expect(400);
    await prisma.connector.update({ where: { id: connectorId }, data: { status: original.status } });
  });

  it("joins waitlist, notifies on availability and allows claim", async () => {
    await prisma.chargingWaitlist.updateMany({
      where: { connectorId, status: { in: ["WAITING", "NOTIFIED"] } },
      data: { status: "CANCELLED" },
    });
    const occupied = await prisma.connector.findFirst({
      where: { id: connectorId },
    });
    assert.ok(occupied);
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: ConnectorStatus.CHARGING },
    });
    const joined = await request(app.getHttpServer())
      .post("/api/waitlist")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId })
      .expect(201);
    assert.ok(joined.body.position >= 1);

    const { WaitlistService } = await import("../dist/reservations/waitlist.service");
    const waitlist = app.get(WaitlistService);
    await waitlist.notifyNext(connectorId);
    const mine = await request(app.getHttpServer())
      .get("/api/waitlist/me")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    const notified = mine.body.find((item: { id: string }) => item.id === joined.body.id);
    assert.equal(notified.status, "NOTIFIED");

    await request(app.getHttpServer())
      .post(`/api/waitlist/${joined.body.id}/claim`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: ConnectorStatus.AVAILABLE },
    });
  });

  it("keeps tariff snapshot on session and blocks cross-tenant / cross-user access", async () => {
    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId, idempotencyKey: `p5-${Date.now()}` })
      .expect(201);
    assert.ok(started.body.tariffSnapshot.pricePerKwhCents);

    await request(app.getHttpServer())
      .get(`/api/sessions/${started.body.id}`)
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get("/api/finance/summary")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);

    const payment = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1100, kind: "PIX" })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/payments/${payment.body.id}`)
      .set("Authorization", `Bearer ${driver2Token}`)
      .expect(403);

    const rjReservations = await request(app.getHttpServer())
      .get("/api/reservations")
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(200);
    assert.equal(
      rjReservations.body.some((item: { companyId?: string }) => item.companyId === companyId),
      false,
    );

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
  });
});

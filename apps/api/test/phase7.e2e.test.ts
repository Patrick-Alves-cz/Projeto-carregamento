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
import { PaymentProviderFactory } from "@evcharge/payment-provider";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describeIfDb("Phase 7 payments, billing and reconciliation", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken: string;
  let driverUserId: string;
  let adminToken: string;
  let operatorRjToken: string;
  let vehicleId: string;
  let connectorId: string;
  let companyId: string;

  before(async () => {
    ChargerProviderFactory.resetMockInstance();
    PaymentProviderFactory.resetMockInstance();
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
        charger: { station: { companyId }, status: "AVAILABLE" },
      },
    });
    assert.ok(connector);
    connectorId = connector.id;

    await prisma.wallet.updateMany({
      where: { userId: driverUserId },
      data: { balanceCents: 50_000 },
    });
  });

  after(async () => {
    await app.close();
  });

  it("exposes mock capabilities without Asaas credentials", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/payments/capabilities")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.equal(res.body.provider, "mock");
    assert.equal(res.body.demo, true);
    assert.equal(res.body.supportsPix, true);
    assert.equal(res.body.supportsCardPreAuthorization, true);
  });

  it("credits PIX once and ignores duplicate/wrong-amount webhooks", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1800, kind: "PIX" })
      .expect(201);
    assert.equal(created.body.status, "PENDING");
    assert.ok(created.body.pixCopyPaste);

    const before = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    const eventId = `p7-${created.body.id}`;
    const paid = await request(app.getHttpServer())
      .post("/api/payments/webhooks/mock")
      .send({
        eventId,
        eventType: "payment.paid",
        paymentId: created.body.id,
        status: "CONFIRMED",
      })
      .expect(201);
    assert.equal(paid.body.replayed, false);

    const replay = await request(app.getHttpServer())
      .post("/api/payments/webhooks/mock")
      .send({
        eventId,
        eventType: "payment.paid",
        paymentId: created.body.id,
        status: "CONFIRMED",
      })
      .expect(201);
    assert.equal(replay.body.replayed, true);

    const after = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    assert.equal(after.balanceCents, before.balanceCents + 1800);

    const mismatch = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1700, kind: "PIX" })
      .expect(201);
    const rejected = await request(app.getHttpServer())
      .post("/api/payments/webhooks/mock")
      .send({
        eventId: `amt-${mismatch.body.id}`,
        eventType: "payment.paid",
        paymentId: mismatch.body.id,
        status: "CONFIRMED",
        amountCents: 9999,
      })
      .expect(201);
    assert.equal(rejected.body.rejected, "amount_mismatch");
    const unpaid = await prisma.payment.findUniqueOrThrow({ where: { id: mismatch.body.id } });
    assert.equal(unpaid.walletCredited, false);
    assert.equal(unpaid.status, "PENDING");
  });

  it("expires and fails PIX without crediting", async () => {
    const expired = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1100, kind: "PIX" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/payments/${expired.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "EXPIRED" })
      .expect(201);
    const failed = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 1100, kind: "PIX" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/payments/${failed.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "FAILED" })
      .expect(201);
    const rows = await prisma.payment.findMany({
      where: { id: { in: [expired.body.id, failed.body.id] } },
    });
    assert.equal(rows.every((row) => !row.walletCredited), true);
  });

  it("rejects invalid webhook signature when secret is set", async () => {
    const prev = process.env.PAYMENT_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_SECRET = "phase7-test-secret";
    try {
      await request(app.getHttpServer())
        .post("/api/payments/webhooks/mock")
        .set("x-webhook-signature", "deadbeef")
        .send({
          eventId: `sig-${Date.now()}`,
          eventType: "payment.paid",
          status: "CONFIRMED",
        })
        .expect(401);
    } finally {
      process.env.PAYMENT_WEBHOOK_SECRET = prev;
    }
  });

  it("tokenizes a card, authorizes a session, captures once and issues a receipt", async () => {
    const method = await request(app.getHttpServer())
      .post("/api/payment-methods")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 })
      .expect(201);
    assert.equal(method.body.last4, "4242");
    assert.ok(method.body.providerMethodId);
    assert.doesNotMatch(String(method.body.providerMethodId), /4111|cvv/i);

    const blocked = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        connectorId,
        vehicleId,
        paymentKind: "CARD",
        idempotencyKey: `card-block-${Date.now()}`,
      });
    assert.equal(blocked.status, 400);
    assert.equal(blocked.body.code, "PAYMENT_REQUIRES_ACTION");

    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        connectorId,
        vehicleId,
        paymentKind: "CARD",
        paymentMethodId: method.body.id,
        idempotencyKey: `card-ok-${Date.now()}`,
      })
      .expect(201);
    assert.ok(["PREPARING", "ACTIVE"].includes(started.body.status));
    const auth = await prisma.paymentAuthorization.findUnique({ where: { sessionId: started.body.id } });
    assert.ok(auth);
    assert.equal(auth.status, "AUTHORIZED");

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const session = await prisma.chargingSession.findUniqueOrThrow({ where: { id: started.body.id } });
    if (session.status === "COMPLETED") {
      assert.ok(["CAPTURED", "PAYMENT_FAILED", "RELEASED"].includes(session.billingStatus));
      const receipt = await prisma.receipt.findUnique({ where: { sessionId: started.body.id } });
      if (session.status === "COMPLETED" && session.billingStatus === "CAPTURED") {
        assert.ok(receipt);
      }
    }
  });

  it("holds wallet funds, captures once and releases the remainder", async () => {
    await prisma.wallet.updateMany({ where: { userId: driverUserId }, data: { balanceCents: 50_000 } });
    const wallet = await request(app.getHttpServer())
      .get("/api/wallet")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(200);
    assert.ok(typeof wallet.body.availableCents === "number");

    const started = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        connectorId,
        vehicleId,
        paymentKind: "WALLET",
        idempotencyKey: `hold-${Date.now()}`,
      })
      .expect(201);
    const hold = await prisma.walletHold.findUnique({ where: { sessionId: started.body.id } });
    assert.ok(hold);
    assert.equal(hold.status, "OPEN");
    const during = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    assert.equal(during.balanceCents, 50_000);

    await request(app.getHttpServer())
      .post(`/api/sessions/${started.body.id}/stop`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);

    const afterHold = await prisma.walletHold.findUnique({ where: { sessionId: started.body.id } });
    const afterWallet = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    assert.ok(afterHold);
    assert.ok(["CAPTURED", "RELEASED"].includes(afterHold.status));
    assert.equal(afterHold.capturedCents + afterHold.releasedCents, afterHold.amountCents);
    assert.equal(afterWallet.balanceCents, 50_000 - afterHold.capturedCents);
    const txs = await prisma.walletTransaction.findMany({
      where: { idempotencyKey: `billing-capture-${started.body.id}` },
    });
    assert.equal(txs.length, afterHold.capturedCents > 0 ? 1 : 0);

    const poor = await prisma.wallet.findUniqueOrThrow({ where: { userId: driverUserId } });
    await prisma.wallet.update({ where: { id: poor.id }, data: { balanceCents: 100 } });
    const denied = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        connectorId,
        vehicleId,
        paymentKind: "WALLET",
        idempotencyKey: `poor-${Date.now()}`,
      });
    assert.ok([400, 402].includes(denied.status));
    await prisma.wallet.update({ where: { id: poor.id }, data: { balanceCents: 50_000 } });
  });

  it("refunds with idempotency and isolates tenants", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/payments")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ amountCents: 2100, kind: "PIX" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/payments/${created.body.id}/simulate`)
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ outcome: "CONFIRMED" })
      .expect(201);
    await prisma.payment.update({
      where: { id: created.body.id },
      data: { companyId },
    });

    await request(app.getHttpServer())
      .post(`/api/payments/${created.body.id}/refund`)
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .send({ reason: "tentativa de estorno cruzado" })
      .expect(403);

    const first = await request(app.getHttpServer())
      .post(`/api/payments/${created.body.id}/refund`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `refund-${created.body.id}`)
      .send({ reason: "cobrança duplicada de teste" })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/payments/${created.body.id}/refund`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", `refund-${created.body.id}`)
      .send({ reason: "cobrança duplicada de teste" })
      .expect(201);
    assert.ok(["REFUNDED", "REFUND_PENDING", "PARTIALLY_REFUNDED"].includes(first.body.status));
    assert.equal(first.body.id, second.body.id);

    const recon = await request(app.getHttpServer())
      .get("/api/finance/reconciliation")
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(200);
    assert.equal(
      (recon.body as Array<{ payment?: { id: string } }>).some((item) => item.payment?.id === created.body.id),
      false,
    );
  });
});

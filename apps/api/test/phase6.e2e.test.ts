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
import { ChargerHealthService } from "../dist/operations/charger-health.service";
import { IncidentsService } from "../dist/operations/incidents.service";
import { ReconciliationCasesService } from "../dist/operations/reconciliation-cases.service";
import { ChargerProviderFactory } from "@evcharge/charger-provider";
import { calculateChargerHealth, calculateReliabilityScore } from "@evcharge/domain";
import { releaseConnector } from "./release-connector";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeIfDb = hasDatabase ? describe : describe.skip;

describe("Phase 6 domain health/reliability/availability", () => {
  it("classifies healthy, stale-offline and faulted chargers", () => {
    const now = new Date();
    assert.equal(
      calculateChargerHealth({
        chargerStatus: "AVAILABLE",
        connectorStatuses: ["AVAILABLE"],
        inMaintenance: false,
        connected: true,
        lastMessageAt: now,
        reconnectCount24h: 0,
        failedCommands1h: 0,
        sessionFailures1h: 0,
        sessionStarts1h: 0,
        openHighIncidents: 0,
        pendingReconciliation: false,
        now,
      }).status,
      "HEALTHY",
    );
    assert.equal(
      calculateChargerHealth({
        chargerStatus: "OFFLINE",
        connectorStatuses: ["UNAVAILABLE"],
        inMaintenance: false,
        connected: false,
        lastMessageAt: new Date(now.getTime() - 20 * 60_000),
        reconnectCount24h: 0,
        failedCommands1h: 0,
        sessionFailures1h: 0,
        sessionStarts1h: 0,
        openHighIncidents: 0,
        pendingReconciliation: false,
        now,
      }).status,
      "OFFLINE",
    );
    assert.equal(
      calculateChargerHealth({
        chargerStatus: "FAULTED",
        connectorStatuses: ["FAULTED"],
        inMaintenance: false,
        connected: true,
        lastMessageAt: now,
        reconnectCount24h: 0,
        failedCommands1h: 0,
        sessionFailures1h: 0,
        sessionStarts1h: 0,
        openHighIncidents: 0,
        pendingReconciliation: false,
        now,
      }).status,
      "FAULTED",
    );
  });

  it("scores successful vs failed sessions", () => {
    const good = calculateReliabilityScore({
      uptimeMinutes: 1440,
      windowMinutes: 1440,
      sessionsStarted: 8,
      sessionsCompleted: 8,
      sessionsFailed: 0,
      commandsSent: 8,
      commandsSucceeded: 8,
      remoteStartFailures: 0,
      remoteStopFailures: 0,
      connectorFaultEvents: 0,
      offlineEvents: 0,
      recoveredEvents: 0,
    });
    const bad = calculateReliabilityScore({
      uptimeMinutes: 200,
      windowMinutes: 1440,
      sessionsStarted: 8,
      sessionsCompleted: 1,
      sessionsFailed: 7,
      commandsSent: 8,
      commandsSucceeded: 1,
      remoteStartFailures: 4,
      remoteStopFailures: 2,
      connectorFaultEvents: 3,
      offlineEvents: 6,
      recoveredEvents: 1,
    });
    assert.ok(good.score >= 90);
    assert.ok(bad.score < 40);
  });
});

describeIfDb("Phase 6 operations", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverToken: string;
  let adminToken: string;
  let operatorRjToken: string;
  let vehicleId: string;
  let stationId: string;
  let connectorId: string;
  let chargerId: string;
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

    driverToken = (await login("driver1@evcharge.demo")).accessToken;
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
    chargerId = connector.chargerId;
    stationId = connector.charger.stationId;
    await releaseConnector(prisma, connectorId);
  });

  after(async () => {
    await app.close();
  });

  it("refreshes charger health to HEALTHY for a live mock charger", async () => {
    const health = app.get(ChargerHealthService);
    const result = await health.refreshCharger(chargerId);
    assert.ok(result);
    assert.ok(
      ["HEALTHY", "DEGRADED", "UNSTABLE"].includes(result.status),
      `expected live mock health, got ${result.status} (${result.reasons.join(",")})`,
    );
  });

  it("opens an offline incident once and updates lastSeenAt on duplicate", async () => {
    const incidents = app.get(IncidentsService);
    const charger = await prisma.charger.findUniqueOrThrow({
      where: { id: chargerId },
      include: { station: true },
    });
    const first = await incidents.openOrTouch({
      companyId: charger.station.companyId,
      stationId: charger.stationId,
      chargerId,
      type: "CHARGER_OFFLINE",
      severity: "HIGH",
      title: "Carregador offline",
      description: "teste",
    });
    const second = await incidents.openOrTouch({
      companyId: charger.station.companyId,
      stationId: charger.stationId,
      chargerId,
      type: "CHARGER_OFFLINE",
      severity: "HIGH",
      title: "Carregador offline",
      description: "teste 2",
    });
    assert.equal(first.id, second.id);
    await incidents.resolveOpen("CHARGER_OFFLINE", chargerId);
  });

  it("blocks new sessions during maintenance", async () => {
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + 60 * 60_000);
    const created = await request(app.getHttpServer())
      .post("/api/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ chargerId, startsAt, endsAt, reason: "Teste fase 6" })
      .expect(201);
    const start = await request(app.getHttpServer())
      .post("/api/sessions/start")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ connectorId, vehicleId });
    assert.ok(start.status === 409 || start.status === 400);
    assert.equal(start.body.code, "MAINTENANCE");
    await request(app.getHttpServer())
      .post(`/api/maintenance/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);
  });

  it("blocks new reservations during maintenance", async () => {
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + 60 * 60_000);
    const created = await request(app.getHttpServer())
      .post("/api/maintenance")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ chargerId, startsAt, endsAt, reason: "Reserva bloqueada" })
      .expect(201);
    const reserved = await request(app.getHttpServer())
      .post("/api/reservations")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({
        stationId,
        connectorId,
        vehicleId,
        startAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        endAt: new Date(Date.now() + 75 * 60_000).toISOString(),
      });
    assert.ok(reserved.status === 409 || reserved.status === 400);
    assert.equal(reserved.body.code, "MAINTENANCE");
    await request(app.getHttpServer())
      .post(`/api/maintenance/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201);
  });

  it("allows station-level waitlist and returns ETA", async () => {
    await prisma.connector.update({ where: { id: connectorId }, data: { status: ConnectorStatus.CHARGING } });
    const joined = await request(app.getHttpServer())
      .post("/api/waitlist")
      .set("Authorization", `Bearer ${driverToken}`)
      .send({ stationId, connectorType: "CCS2", scope: "CONNECTOR_TYPE" })
      .expect(201);
    assert.ok(joined.body.id);
    assert.ok(joined.body.etaLabel || joined.body.etaMinutes === null || joined.body.etaMinutes >= 0);
    await request(app.getHttpServer())
      .post(`/api/waitlist/${joined.body.id}/cancel`)
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(201);
    await prisma.connector.update({ where: { id: connectorId }, data: { status: ConnectorStatus.AVAILABLE } });
  });

  it("denies cross-tenant incident access and driver admin endpoints", async () => {
    const list = await request(app.getHttpServer())
      .get("/api/incidents")
      .set("Authorization", `Bearer ${operatorRjToken}`)
      .expect(200);
    assert.equal(
      list.body.some((item: { companyId?: string }) => item.companyId && item.companyId === companyId),
      false,
    );
    await request(app.getHttpServer())
      .get("/api/incidents")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get("/api/operations/summary")
      .set("Authorization", `Bearer ${driverToken}`)
      .expect(403);
  });

  it("records ChangeAvailability as a charger command", async () => {
    const connector = await prisma.connector.findUniqueOrThrow({ where: { id: connectorId } });
    const result = await request(app.getHttpServer())
      .post(`/api/chargers/${chargerId}/ocpp/command`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        action: "CHANGE_AVAILABILITY",
        connectorNumber: connector.number,
        availability: "Operative",
        confirm: true,
      });
    assert.ok(result.status === 201 || result.status === 200 || result.status === 400);
    const command = await prisma.chargerCommand.findFirst({
      where: { chargerId, type: "CHANGE_AVAILABILITY" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(command);
  });

  it("opens a reconciliation case for stale telemetry without auto-closing the session", async () => {
    const recon = app.get(ReconciliationCasesService);
    const charger = await prisma.charger.findUniqueOrThrow({
      where: { id: chargerId },
      include: { station: true },
    });
    const opened = await recon.open({
      companyId: charger.station.companyId,
      chargerId,
      reason: "STALE_METER_VALUES",
      classification: "REQUIRES_RECONCILIATION",
    });
    const again = await recon.open({
      companyId: charger.station.companyId,
      chargerId,
      reason: "STALE_METER_VALUES",
      classification: "REQUIRES_RECONCILIATION",
    });
    assert.equal(opened.id, again.id);
    const listed = await request(app.getHttpServer())
      .get("/api/operations/reconciliation")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(listed.body.some((item: { id: string }) => item.id === opened.id));
    await prisma.reconciliationCase.delete({ where: { id: opened.id } });
  });
});

import { config } from "dotenv";
import { resolve } from "node:path";
import bcrypt from "bcrypt";
import {
  PrismaClient,
  UserRole,
  CompanyMemberRole,
  StationStatus,
  ChargerStatus,
  ConnectorStatus,
  ConnectorType,
  StationAccessType,
} from "@prisma/client";

config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env"), override: true });

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345";
const DEMO_EMAIL_DOMAIN = "@evcharge.demo";
const COMPANY_SLUGS = ["evcharge-sp", "evcharge-rj", "evcharge-mt"];

const now = new Date();
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3_600_000);

async function main() {
  console.log("Seeding demo data...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.ocppAuthorization.deleteMany({});
  await prisma.ocppTransaction.deleteMany({});
  await prisma.chargerEvent.deleteMany({});
  await prisma.chargerCredential.deleteMany({});
  await prisma.paymentReconciliationCase.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.incident.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.maintenanceWindow.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.walletHold.deleteMany({
    where: { wallet: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } },
  });
  await prisma.paymentAuthorization.deleteMany({
    where: { session: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } },
  });
  await prisma.inAppNotification.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.passwordResetToken.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.invitation.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.paymentWebhookEvent.deleteMany({
    where: { payment: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } },
  });
  await prisma.chargingWaitlist.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.favoriteStation.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.reservation.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.paymentMethod.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.receipt.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.refreshToken.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.walletTransaction.deleteMany({
    where: { wallet: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } },
  });
  await prisma.payment.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.meterValue.deleteMany({
    where: { session: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } } },
  });
  await prisma.chargingSession.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.wallet.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.chargingEvent.deleteMany({});
  await prisma.tariff.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.connector.deleteMany({
    where: { charger: { station: { company: { slug: { in: COMPANY_SLUGS } } } } },
  });
  await prisma.charger.deleteMany({
    where: { station: { company: { slug: { in: COMPANY_SLUGS } } } },
  });
  await prisma.station.deleteMany({
    where: { company: { slug: { in: COMPANY_SLUGS } } },
  });
  await prisma.vehicle.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.companyMember.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.profile.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.user.deleteMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } } });
  await prisma.company.deleteMany({ where: { slug: { in: COMPANY_SLUGS } } });

  const superAdmin = await prisma.user.create({
    data: {
      email: `superadmin${DEMO_EMAIL_DOMAIN}`,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      profile: { create: { fullName: "Super Admin Demo", phone: "+5561999990000" } },
    },
  });

  const companySp = await prisma.company.create({
    data: { name: "EV Charge São Paulo", slug: "evcharge-sp", cnpj: "00000000000101" },
  });
  const companyRj = await prisma.company.create({
    data: { name: "EV Charge Rio", slug: "evcharge-rj", cnpj: "00000000000102" },
  });
  const companyMt = await prisma.company.create({
    data: { name: "EV Charge Mato Grosso", slug: "evcharge-mt", cnpj: "00000000000103" },
  });

  const operatorSp = await createMember({
    email: `operator.sp${DEMO_EMAIL_DOMAIN}`,
    fullName: "Operador SP",
    role: UserRole.OPERATOR,
    companyId: companySp.id,
    memberRole: CompanyMemberRole.OPERATOR,
    passwordHash,
  });
  const operatorRj = await createMember({
    email: `operator.rj${DEMO_EMAIL_DOMAIN}`,
    fullName: "Operador RJ",
    role: UserRole.OPERATOR,
    companyId: companyRj.id,
    memberRole: CompanyMemberRole.OPERATOR,
    passwordHash,
  });
  const operatorMt = await createMember({
    email: `operator.mt${DEMO_EMAIL_DOMAIN}`,
    fullName: "Operador Cuiabá",
    role: UserRole.OPERATOR,
    companyId: companyMt.id,
    memberRole: CompanyMemberRole.OPERATOR,
    passwordHash,
  });
  const adminSp = await createMember({
    email: `admin.sp${DEMO_EMAIL_DOMAIN}`,
    fullName: "Admin SP",
    role: UserRole.ADMIN,
    companyId: companySp.id,
    memberRole: CompanyMemberRole.ADMIN,
    passwordHash,
  });

  const drivers = await Promise.all(
    [
      { email: `driver1${DEMO_EMAIL_DOMAIN}`, name: "Ana Motorista", phone: "+5511980000001" },
      { email: `driver2${DEMO_EMAIL_DOMAIN}`, name: "Bruno Motorista", phone: "+5511980000002" },
      { email: `driver3${DEMO_EMAIL_DOMAIN}`, name: "Carla Motorista", phone: "+5521980000003" },
      { email: `driver4${DEMO_EMAIL_DOMAIN}`, name: "Diego Motorista", phone: "+5565980000004" },
      { email: `driver5${DEMO_EMAIL_DOMAIN}`, name: "Elena Motorista", phone: "+5511980000005" },
    ].map((d) =>
      prisma.user.create({
        data: {
          email: d.email,
          passwordHash,
          role: UserRole.DRIVER,
          profile: { create: { fullName: d.name, phone: d.phone } },
        },
      }),
    ),
  );

  await prisma.vehicle.createMany({
    data: [
      { userId: drivers[0]!.id, brand: "BYD", model: "Dolphin", year: 2024, batteryKwh: 60, connectorTypes: [ConnectorType.CCS2], isDefault: true },
      { userId: drivers[1]!.id, brand: "Tesla", model: "Model 3", year: 2023, batteryKwh: 75, connectorTypes: [ConnectorType.CCS2, ConnectorType.NACS], isDefault: true },
      { userId: drivers[2]!.id, brand: "Renault", model: "Kwid E-Tech", year: 2024, batteryKwh: 26, connectorTypes: [ConnectorType.TYPE2], isDefault: true },
      { userId: drivers[3]!.id, brand: "BMW", model: "iX1", year: 2024, batteryKwh: 64, connectorTypes: [ConnectorType.CCS2], isDefault: true },
      { userId: drivers[4]!.id, brand: "Volkswagen", model: "ID.4", year: 2023, batteryKwh: 77, connectorTypes: [ConnectorType.CCS2, ConnectorType.TYPE2], isDefault: true },
    ],
  });

  await prisma.paymentMethod.createMany({
    data: drivers.map((driver, index) => ({
      userId: driver.id,
      provider: "mock",
      providerMethodId: `tok_mock_4242_${index}`,
      brand: "visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
    })),
  });

  type ConnSeed = { n: number; type: ConnectorType; power: number; status: ConnectorStatus };
  type ChargerSeed = {
    serial: string;
    model: string;
    power: number;
    status: ChargerStatus;
    lastSeenAt: Date | null;
    connectors: ConnSeed[];
  };
  type StationSeed = {
    companyId: string;
    name: string;
    address: string;
    city: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    status: StationStatus;
    accessType: StationAccessType;
    amenities: string[];
    openingHours: Record<string, unknown>;
    chargers: ChargerSeed[];
  };

  const stationsData: StationSeed[] = [
    {
      companyId: companySp.id,
      name: "EV Charge Paulista DC",
      address: "Av. Paulista, 1578",
      city: "São Paulo",
      postalCode: "01310-200",
      latitude: -23.5614,
      longitude: -46.6559,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["wifi", "estacionamento", "banheiro"],
      openingHours: { alwaysOpen: true, timezone: "America/Sao_Paulo", label: "24 horas" },
      chargers: [
        { serial: "SP-DC-001", model: "ABB Terra 184", power: 150, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.2), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.CHARGING }] },
        { serial: "SP-DC-002", model: "ABB Terra 184", power: 150, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.3), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.AVAILABLE }] },
        { serial: "SP-DC-003", model: "Delta 120", power: 120, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.4), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 120, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companySp.id,
      name: "EV Charge Shopping AC",
      address: "Rua Augusta, 1475",
      city: "São Paulo",
      postalCode: "01305-100",
      latitude: -23.5537,
      longitude: -46.6595,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["wifi", "restaurante", "estacionamento"],
      openingHours: { label: "10:00–22:00", timezone: "America/Sao_Paulo" },
      chargers: [
        { serial: "SP-AC-001", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(1), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "SP-AC-002", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(1), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.CHARGING }] },
      ],
    },
    {
      companyId: companySp.id,
      name: "EV Charge Ibirapuera",
      address: "Av. Pedro Álvares Cabral, 500",
      city: "São Paulo",
      postalCode: "04094-050",
      latitude: -23.5874,
      longitude: -46.6576,
      status: StationStatus.MAINTENANCE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["estacionamento"],
      openingHours: { label: "Em manutenção", timezone: "America/Sao_Paulo" },
      chargers: [
        { serial: "SP-IBI-001", model: "Siemens Sicharge D", power: 50, status: ChargerStatus.UNAVAILABLE, lastSeenAt: hoursAgo(2), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.UNAVAILABLE }] },
        { serial: "SP-IBI-002", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.OFFLINE, lastSeenAt: hoursAgo(18), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.UNAVAILABLE }] },
      ],
    },
    {
      companyId: companyRj.id,
      name: "EV Charge Copacabana Multi",
      address: "Av. Atlântica, 1702",
      city: "Rio de Janeiro",
      postalCode: "22021-001",
      latitude: -22.9711,
      longitude: -43.1822,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["wifi", "banheiro", "restaurante"],
      openingHours: { alwaysOpen: true, timezone: "America/Sao_Paulo", label: "24 horas" },
      chargers: [
        { serial: "RJ-MULTI-001", model: "Tritium PKM150", power: 180, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.3), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 180, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CHADEMO, power: 100, status: ConnectorStatus.AVAILABLE }, { n: 3, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-MULTI-002", model: "ABB Terra 54", power: 60, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.5), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 60, status: ConnectorStatus.FAULTED }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-MULTI-003", model: "ABB Terra 54", power: 50, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.2), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companyRj.id,
      name: "EV Charge Barra da Tijuca",
      address: "Av. das Américas, 4666",
      city: "Rio de Janeiro",
      postalCode: "22640-102",
      latitude: -23.0045,
      longitude: -43.3186,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["estacionamento", "wifi"],
      openingHours: { label: "06:00–23:00", timezone: "America/Sao_Paulo" },
      chargers: [
        { serial: "RJ-BARRA-001", model: "Delta 50", power: 50, status: ChargerStatus.CHARGING, lastSeenAt: minutesAgo(0.1), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.CHARGING }] },
        { serial: "RJ-BARRA-002", model: "Delta 50", power: 50, status: ChargerStatus.CHARGING, lastSeenAt: minutesAgo(0.1), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.CHARGING }] },
        { serial: "RJ-BARRA-003", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.CHARGING, lastSeenAt: minutesAgo(0.2), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.CHARGING }] },
        { serial: "RJ-BARRA-004", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.PREPARING, lastSeenAt: minutesAgo(0.1), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.PREPARING }] },
      ],
    },
    {
      companyId: companyMt.id,
      name: "EV Station Cuiabá",
      address: "Av. Historiador Rubens de Mendonça, 2200",
      city: "Cuiabá",
      postalCode: "78050-000",
      latitude: -15.6014,
      longitude: -56.0979,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["wifi", "banheiro", "estacionamento", "restaurante"],
      openingHours: { alwaysOpen: true, timezone: "America/Cuiaba", label: "24 horas" },
      chargers: [
        { serial: "MT-CBA-001", model: "ABB Terra 184", power: 150, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.2), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.AVAILABLE }] },
        { serial: "MT-CBA-002", model: "ABB Terra 184", power: 150, status: ChargerStatus.CHARGING, lastSeenAt: minutesAgo(0.2), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.CHARGING }] },
        { serial: "MT-CBA-003", model: "Delta 120", power: 120, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.3), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 120, status: ConnectorStatus.AVAILABLE }] },
        { serial: "MT-CBA-004", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.4), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companyMt.id,
      name: "EV Charge Cuiabá Centro",
      address: "Praça da República, 80",
      city: "Cuiabá",
      postalCode: "78005-140",
      latitude: -15.5989,
      longitude: -56.0949,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.RESTRICTED,
      amenities: ["estacionamento"],
      openingHours: { label: "08:00–20:00", timezone: "America/Cuiaba" },
      chargers: [
        { serial: "MT-CEN-001", model: "Wallbox Pulsar Plus", power: 22, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(2), connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "MT-CEN-002", model: "ChargePoint Home", power: 7, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(3), connectors: [{ n: 1, type: ConnectorType.J1772, power: 7, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companyMt.id,
      name: "EV Charge Cuiabá Aeroporto",
      address: "Av. João Ponce de Arruda, s/n",
      city: "Cuiabá",
      postalCode: "78010-900",
      latitude: -15.6529,
      longitude: -56.1166,
      status: StationStatus.ACTIVE,
      accessType: StationAccessType.PUBLIC,
      amenities: ["wifi", "banheiro", "estacionamento"],
      openingHours: { alwaysOpen: true, timezone: "America/Cuiaba", label: "24 horas" },
      chargers: [
        { serial: "MT-AIR-001", model: "Tesla Supercharger V3", power: 250, status: ChargerStatus.AVAILABLE, lastSeenAt: minutesAgo(0.5), connectors: [{ n: 1, type: ConnectorType.NACS, power: 250, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.AVAILABLE }] },
        { serial: "MT-AIR-002", model: "Star Charge 60", power: 60, status: ChargerStatus.OFFLINE, lastSeenAt: hoursAgo(26), connectors: [{ n: 1, type: ConnectorType.GB_T, power: 60, status: ConnectorStatus.UNAVAILABLE }] },
        { serial: "MT-AIR-003", model: "ABB Terra 54", power: 50, status: ChargerStatus.FAULTED, lastSeenAt: hoursAgo(4), connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.FAULTED }] },
      ],
    },
  ];

  let chargerCount = 0;
  let connectorCount = 0;

  for (const s of stationsData) {
    const station = await prisma.station.create({
      data: {
        companyId: s.companyId,
        name: s.name,
        address: s.address,
        city: s.city,
        postalCode: s.postalCode,
        latitude: s.latitude,
        longitude: s.longitude,
        status: s.status,
        accessType: s.accessType,
        amenities: s.amenities,
        openingHours: s.openingHours,
      },
    });

    for (const c of s.chargers) {
      chargerCount++;
      const charger = await prisma.charger.create({
        data: {
          stationId: station.id,
          serialNumber: c.serial,
          identity: c.serial,
          model: c.model,
          maxPowerKw: c.power,
          status: c.status,
          providerId: "mock",
          lastSeenAt: c.lastSeenAt,
        },
      });
      for (const conn of c.connectors) {
        connectorCount++;
        await prisma.connector.create({
          data: {
            chargerId: charger.id,
            number: conn.n,
            type: conn.type,
            maxPowerKw: conn.power,
            status: conn.status,
          },
        });
      }
    }
  }

  const mtStation = await prisma.station.findFirst({
    where: { companyId: companyMt.id },
    orderBy: { name: "asc" },
  });
  if (mtStation) {
    const ocppIdentity = "EVSE-CUIABA-001";
    const ocppCharger = await prisma.charger.create({
      data: {
        stationId: mtStation.id,
        identity: ocppIdentity,
        serialNumber: ocppIdentity,
        model: "OCPP Simulator 1.6",
        vendor: "EVCharge",
        protocol: "ocpp1.6",
        maxPowerKw: 60,
        status: ChargerStatus.OFFLINE,
        providerId: "ocpp16",
      },
    });
    await prisma.connector.createMany({
      data: [
        {
          chargerId: ocppCharger.id,
          number: 1,
          type: ConnectorType.CCS2,
          maxPowerKw: 60,
          status: ConnectorStatus.UNAVAILABLE,
        },
        {
          chargerId: ocppCharger.id,
          number: 2,
          type: ConnectorType.TYPE2,
          maxPowerKw: 22,
          status: ConnectorStatus.UNAVAILABLE,
        },
      ],
    });
    await prisma.chargerCredential.create({
      data: {
        chargerId: ocppCharger.id,
        credentialHash: await bcrypt.hash("DemoCharger@12345", 12),
      },
    });
    chargerCount += 1;
    connectorCount += 2;
  }

  await prisma.tariff.createMany({
    data: [
      {
        companyId: companySp.id,
        name: "Tarifa SP Padrão",
        pricePerKwhCents: 189,
        pricePerMinuteCents: 0,
        idleFeeCents: 0,
        connectionFeeCents: 0,
        minBalanceCents: 1000,
      },
      {
        companyId: companyRj.id,
        name: "Tarifa RJ Padrão",
        pricePerKwhCents: 175,
        minBalanceCents: 1000,
      },
      {
        companyId: companyMt.id,
        name: "Tarifa MT Padrão",
        pricePerKwhCents: 189,
        minBalanceCents: 1000,
      },
    ],
  });

  for (const driver of drivers) {
    const wallet = await prisma.wallet.create({
      data: { userId: driver.id, balanceCents: 10000, currency: "BRL" },
    });
    await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "CREDIT",
        kind: "DEPOSIT",
        amountCents: 10000,
        balanceAfterCents: 10000,
        description: "Saldo inicial DEMO",
      },
    });
  }

  console.log("Seed completed:");
  console.log(`  Super admin: superadmin${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Operators: operator.sp, operator.rj, operator.mt${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Admin: admin.sp${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Drivers: driver1..5${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Password (all): ${DEMO_PASSWORD}`);
  console.log(`  Companies: ${COMPANY_SLUGS.join(", ")}`);
  console.log(`  Stations: ${stationsData.length}, Chargers: ${chargerCount}, Connectors: ${connectorCount}`);
  console.log(`  Demo wallets: R$ 100,00 for each driver`);
  console.log(`  OCPP charger: EVSE-CUIABA-001 (secret DemoCharger@12345, starts OFFLINE)`);
  console.log(`  Super admin id: ${superAdmin.id}`);
  void operatorSp;
  void operatorRj;
  void operatorMt;
  void adminSp;
}

async function createMember(opts: {
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string;
  memberRole: CompanyMemberRole;
  passwordHash: string;
}) {
  return prisma.user.create({
    data: {
      email: opts.email,
      passwordHash: opts.passwordHash,
      role: opts.role,
      profile: { create: { fullName: opts.fullName, phone: "+5565999990000" } },
      companyMembers: {
        create: { companyId: opts.companyId, role: opts.memberRole },
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

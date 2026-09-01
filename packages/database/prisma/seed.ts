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
} from "@prisma/client";

config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env"), override: true });

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@12345";
const DEMO_EMAIL_DOMAIN = "@evcharge.demo";

async function main() {
  console.log("Seeding demo data...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await prisma.refreshToken.deleteMany({
    where: { user: { email: { endsWith: DEMO_EMAIL_DOMAIN } } },
  });
  await prisma.connector.deleteMany({
    where: { charger: { station: { company: { slug: { in: ["evcharge-sp", "evcharge-rj"] } } } } },
  });
  await prisma.charger.deleteMany({
    where: { station: { company: { slug: { in: ["evcharge-sp", "evcharge-rj"] } } } },
  });
  await prisma.station.deleteMany({
    where: { company: { slug: { in: ["evcharge-sp", "evcharge-rj"] } } },
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
  await prisma.company.deleteMany({ where: { slug: { in: ["evcharge-sp", "evcharge-rj"] } } });

  const superAdmin = await prisma.user.create({
    data: {
      email: `superadmin${DEMO_EMAIL_DOMAIN}`,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      profile: { create: { fullName: "Super Admin Demo" } },
    },
  });

  const companySp = await prisma.company.create({
    data: { name: "EV Charge São Paulo", slug: "evcharge-sp", cnpj: "00000000000101" },
  });
  const companyRj = await prisma.company.create({
    data: { name: "EV Charge Rio", slug: "evcharge-rj", cnpj: "00000000000102" },
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
      { email: `driver1${DEMO_EMAIL_DOMAIN}`, name: "Ana Motorista" },
      { email: `driver2${DEMO_EMAIL_DOMAIN}`, name: "Bruno Motorista" },
      { email: `driver3${DEMO_EMAIL_DOMAIN}`, name: "Carla Motorista" },
      { email: `driver4${DEMO_EMAIL_DOMAIN}`, name: "Diego Motorista" },
      { email: `driver5${DEMO_EMAIL_DOMAIN}`, name: "Elena Motorista" },
    ].map((d) =>
      prisma.user.create({
        data: {
          email: d.email,
          passwordHash,
          role: UserRole.DRIVER,
          profile: { create: { fullName: d.name } },
        },
      }),
    ),
  );

  await prisma.vehicle.createMany({
    data: [
      { userId: drivers[0]!.id, brand: "BYD", model: "Dolphin", year: 2024, batteryKwh: 60, connectorTypes: [ConnectorType.CCS2] },
      { userId: drivers[1]!.id, brand: "Tesla", model: "Model 3", year: 2023, batteryKwh: 75, connectorTypes: [ConnectorType.CCS2, ConnectorType.NACS] },
      { userId: drivers[2]!.id, brand: "Renault", model: "Kwid E-Tech", year: 2024, batteryKwh: 26, connectorTypes: [ConnectorType.TYPE2] },
      { userId: drivers[3]!.id, brand: "BMW", model: "iX1", year: 2024, batteryKwh: 64, connectorTypes: [ConnectorType.CCS2] },
      { userId: drivers[4]!.id, brand: "Volkswagen", model: "ID.4", year: 2023, batteryKwh: 77, connectorTypes: [ConnectorType.CCS2, ConnectorType.TYPE2] },
    ],
  });

  const stationsData = [
    {
      companyId: companySp.id,
      name: "EV Charge Paulista DC",
      address: "Av. Paulista, 1000 - São Paulo, SP",
      latitude: -23.5614,
      longitude: -46.6559,
      status: StationStatus.ACTIVE,
      chargers: [
        { serial: "SP-DC-001", power: 150, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CCS2, power: 150, status: ConnectorStatus.OCCUPIED }] },
        { serial: "SP-DC-002", power: 120, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 120, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CCS2, power: 120, status: ConnectorStatus.AVAILABLE }] },
        { serial: "SP-DC-003", power: 100, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 100, status: ConnectorStatus.AVAILABLE }] },
        { serial: "SP-DC-004", power: 80, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 80, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companySp.id,
      name: "EV Charge Shopping AC",
      address: "Rua Augusta, 500 - São Paulo, SP",
      latitude: -23.5537,
      longitude: -46.6595,
      status: StationStatus.ACTIVE,
      chargers: [
        { serial: "SP-AC-001", power: 22, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "SP-AC-002", power: 22, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companySp.id,
      name: "EV Charge Manutenção BH",
      address: "Av. Afonso Pena, 100 - Belo Horizonte, MG",
      latitude: -19.9167,
      longitude: -43.9345,
      status: StationStatus.MAINTENANCE,
      chargers: [
        { serial: "SP-MG-001", power: 50, status: ChargerStatus.OFFLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.UNAVAILABLE }] },
        { serial: "SP-MG-002", power: 22, status: ChargerStatus.OFFLINE, connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.UNAVAILABLE }] },
      ],
    },
    {
      companyId: companyRj.id,
      name: "EV Charge Copacabana Multi",
      address: "Av. Atlântica, 200 - Rio de Janeiro, RJ",
      latitude: -22.9711,
      longitude: -43.1822,
      status: StationStatus.ACTIVE,
      chargers: [
        { serial: "RJ-MULTI-001", power: 180, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 180, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.CHADEMO, power: 100, status: ConnectorStatus.AVAILABLE }, { n: 3, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-MULTI-002", power: 60, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 60, status: ConnectorStatus.FAULTED }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-MULTI-003", power: 50, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.AVAILABLE }] },
      ],
    },
    {
      companyId: companyRj.id,
      name: "EV Charge Curitiba Offline",
      address: "R. XV de Novembro, 50 - Curitiba, PR",
      latitude: -25.4284,
      longitude: -49.2733,
      status: StationStatus.ACTIVE,
      chargers: [
        { serial: "RJ-PR-001", power: 75, status: ChargerStatus.OFFLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 75, status: ConnectorStatus.UNAVAILABLE }] },
        { serial: "RJ-PR-002", power: 22, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }, { n: 2, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-PR-003", power: 50, status: ChargerStatus.ONLINE, connectors: [{ n: 1, type: ConnectorType.CCS2, power: 50, status: ConnectorStatus.AVAILABLE }] },
        { serial: "RJ-PR-005", power: 22, status: ChargerStatus.OFFLINE, connectors: [{ n: 1, type: ConnectorType.TYPE2, power: 22, status: ConnectorStatus.UNAVAILABLE }] },
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
        latitude: s.latitude,
        longitude: s.longitude,
        status: s.status,
        amenities: ["wifi", "cobertura"],
      },
    });

    for (const c of s.chargers) {
      chargerCount++;
      const charger = await prisma.charger.create({
        data: {
          stationId: station.id,
          serialNumber: c.serial,
          model: "Demo Charger",
          maxPowerKw: c.power,
          status: c.status,
          providerId: "mock",
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

  console.log("Seed completed:");
  console.log(`  Super admin: superadmin${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Operators: operator.sp${DEMO_EMAIL_DOMAIN}, operator.rj${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Admin: admin.sp${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Drivers: driver1..5${DEMO_EMAIL_DOMAIN}`);
  console.log(`  Password (all): ${DEMO_PASSWORD}`);
  console.log(`  Companies: ${companySp.slug}, ${companyRj.slug}`);
  console.log(`  Stations: 5, Chargers: ${chargerCount}, Connectors: ${connectorCount}`);
  console.log(`  Super admin id: ${superAdmin.id}`);
  void operatorSp;
  void operatorRj;
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
      profile: { create: { fullName: opts.fullName } },
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

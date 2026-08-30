export const APP_NAME = "EV Charge Platform";

export const CONNECTOR_TYPES = [
  "TYPE2",
  "CCS2",
  "CHADEMO",
  "J1772",
  "NACS",
] as const;

export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const USER_ROLES = ["DRIVER", "OPERATOR", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const COMPANY_MEMBER_ROLES = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"] as const;
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number];

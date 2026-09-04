export const APP_NAME = "EV Charge Platform";

export const CONNECTOR_TYPES = [
  "TYPE2",
  "CCS2",
  "CHADEMO",
  "J1772",
  "NACS",
  "GB_T",
  "OTHER",
] as const;

export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  TYPE2: "Type 2",
  CCS2: "CCS2",
  CHADEMO: "CHAdeMO",
  J1772: "J1772",
  NACS: "NACS",
  GB_T: "GB/T",
  OTHER: "Outro",
};

export const STATION_ACCESS_TYPES = ["PUBLIC", "PRIVATE", "RESTRICTED"] as const;
export type StationAccessType = (typeof STATION_ACCESS_TYPES)[number];

export const CURRENT_TYPES = ["AC", "DC"] as const;
export type CurrentType = (typeof CURRENT_TYPES)[number];

export const USER_ROLES = ["DRIVER", "OPERATOR", "ADMIN", "SUPER_ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ADMIN_PANEL_ROLES = ["OPERATOR", "ADMIN", "SUPER_ADMIN"] as const;
export type AdminPanelRole = (typeof ADMIN_PANEL_ROLES)[number];

export function isAdminPanelRole(role: string): role is AdminPanelRole {
  return (ADMIN_PANEL_ROLES as readonly string[]).includes(role);
}

export function isDriverRole(role: string): boolean {
  return role === "DRIVER";
}

export const COMPANY_MEMBER_ROLES = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"] as const;
export type CompanyMemberRole = (typeof COMPANY_MEMBER_ROLES)[number];

export const INVITE_ROLES = ["OPERATOR", "ADMIN"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const WALLET_TOPUP_PRESETS_CENTS = [2000, 5000, 10000, 20000] as const;
export const WALLET_TOPUP_MIN_CENTS = 1000;
export const WALLET_TOPUP_MAX_CENTS = 50000;
export const DEFAULT_MIN_BALANCE_CENTS = 1000;
export const GENERIC_PASSWORD_RESET_MESSAGE = "Se a conta existir, enviaremos instruções.";

export const WALLET_TX_KINDS = ["DEPOSIT", "CHARGE", "REFUND", "ADJUSTMENT"] as const;
export type WalletTxKind = (typeof WALLET_TX_KINDS)[number];

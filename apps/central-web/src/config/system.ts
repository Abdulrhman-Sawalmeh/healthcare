import { Role, SessionUser, Workspace } from "../types";

export type FrontendSystemKind = "central" | "medium_center" | "small_center";

export interface DemoAccount {
  group: string;
  roleLabel: string;
  identifier: string;
  password: string;
}

export interface FrontendSystemConfig {
  kind: FrontendSystemKind;
  key: string;
  name: string;
  shortName: string;
  description: string;
  workspace: Workspace;
  allowedRoles: Role[];
  allowedRoutes: string[];
  allowedCenterCode?: string;
  apiUrl: string;
  storageKey: string;
  loginEyebrow: string;
  loginTitle: string;
  loginDescription: string;
  dashboardLabel: string;
  feedLabel: string;
  feedTitle: string;
  accessDeniedMessage: string;
  demoAccounts: DemoAccount[];
}

export const systemConfig: FrontendSystemConfig = {
  kind: "central",
  key: "central-system",
  name: "النظام المركزي",
  shortName: "النظام المركزي",
  description: "لوحة موحدة لمتابعة المراكز والمرضى والإحالات والمزامنة.",
  workspace: "central",
  allowedRoles: ["CENTRAL_ADMIN"],
  allowedRoutes: ["/", "/centers", "/patients", "/referrals", "/master-data", "/analytics", "/reports", "/audit-logs", "/notifications"],
  apiUrl: "http://localhost:4000/api",
  storageKey: "healthcare.central-web.token",
  loginEyebrow: "",
  loginTitle: "",
  loginDescription: "",
  dashboardLabel: "Healthcare Ecosystem",
  feedLabel: "سجل الإشعارات",
  feedTitle: "آخر الإشعارات",
  accessDeniedMessage: "هذا الحساب غير مصرح له في النظام المركزي.",
  demoAccounts: [
    {
      group: "النظام المركزي",
      roleLabel: "CENTRAL_ADMIN",
      identifier: "central-admin",
      password: "Password123!"
    }
  ]
};

export function isUserAllowedForSystem(user: SessionUser) {
  if (user.workspace !== systemConfig.workspace) {
    return false;
  }

  if (!systemConfig.allowedRoles.includes(user.role)) {
    return false;
  }

  if (systemConfig.allowedCenterCode) {
    return user.center?.code === systemConfig.allowedCenterCode;
  }

  return true;
}

export function isRouteEnabled(path: string) {
  return systemConfig.allowedRoutes.includes(path);
}

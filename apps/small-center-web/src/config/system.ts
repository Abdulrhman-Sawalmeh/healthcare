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
  kind: "small_center",
  key: "small-center-system",
  name: "المركز الصحي الصغير",
  shortName: "نظام المركز الصحي الصغير",
  description: "نظام محلي لإدارة الاستقبال والعيادات والإحالات مع بوابة مرضى.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "PATIENT", "RECEPTIONIST"],
  allowedRoutes: ["/", "/appointments", "/medical-record", "/doctors", "/messages", "/patients", "/visits", "/referrals", "/notifications"],
  allowedCenterCode: "C001",
  apiUrl: "http://localhost:4200/api",
  storageKey: "healthcare.small-center-web.token",
  loginEyebrow: "نظام المركز الصحي الصغير",
  loginTitle: "",
  loginDescription: "",
  dashboardLabel: "تشغيل المركز الصغير",
  feedLabel: "آخر المستجدات",
  feedTitle: "الإشعارات والتنبيهات",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي الصغير.",
  demoAccounts: [
    {
      group: "المركز الصحي الصغير",
      roleLabel: "CENTER_MANAGER",
      identifier: "small-manager",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "DOCTOR",
      identifier: "small-doctor",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "PATIENT",
      identifier: "small-patient",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "RECEPTIONIST",
      identifier: "small-receptionist",
      password: "Password123!"
    }
  ]
};

export function isUserAllowedForSystem(user: SessionUser) {
  const isLegacyPatient = user.workspace === "legacy" && user.role === "PATIENT";

  if (!isLegacyPatient && user.workspace !== systemConfig.workspace) {
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

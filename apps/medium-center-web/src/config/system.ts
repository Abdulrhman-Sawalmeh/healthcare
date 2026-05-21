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
  kind: "medium_center",
  key: "medium-center-system",
  name: "المركز الصحي المتوسط",
  shortName: "نظام المركز الصحي المتوسط",
  description: "نظام محلي لإدارة الاستقبال والعيادات والزيارات والإحالات مع بوابة مرضى.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "PATIENT", "RECEPTIONIST"],
  allowedRoutes: ["/", "/appointments", "/medical-record", "/doctors", "/messages", "/patients", "/visits", "/referrals", "/notifications"],
  allowedCenterCode: "M002",
  apiUrl: "http://localhost:4100/api",
  storageKey: "healthcare.medium-center-web.token",
  loginEyebrow: "نظام المركز الصحي المتوسط",
  loginTitle: "",
  loginDescription: "",
  dashboardLabel: "تشغيل المركز المتوسط",
  feedLabel: "آخر المستجدات",
  feedTitle: "الإشعارات والتنبيهات",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي المتوسط.",
  demoAccounts: [
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "CENTER_MANAGER",
      identifier: "medium-manager",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "DOCTOR",
      identifier: "medium-doctor",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "PATIENT",
      identifier: "medium-patient",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "RECEPTIONIST",
      identifier: "medium-receptionist",
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

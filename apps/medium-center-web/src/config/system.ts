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

const demoPassword = "Password123!";

export const systemConfig: FrontendSystemConfig = {
  kind: "medium_center",
  key: "medium-center-system",
  name: "المركز الصحي",
  shortName: "نظام المركز الصحي",
  description: "نظام محلي لإدارة الاستقبال والعيادات والزيارات والإحالات مع بوابة المرضى.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "PATIENT", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"],
  allowedRoutes: [
    "/",
    "/appointments",
    "/medical-record",
    "/doctors",
    "/messages",
    "/ai-assistant",
    "/patients",
    "/visits",
    "/visit-workflow",
    "/referrals",
    "/prescription-verification",
    "/notifications"
  ],
  allowedCenterCode: "M002",
  apiUrl: "http://localhost:4100/api",
  storageKey: "healthcare.medium-center-web.token",
  loginEyebrow: "نظام المركز الصحي",
  loginTitle: "",
  loginDescription: "",
  dashboardLabel: "تشغيل المركز الصحي",
  feedLabel: "آخر المستجدات",
  feedTitle: "الإشعارات والتنبيهات",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي.",
  demoAccounts: [
    { group: "المركز الصحي", roleLabel: "مدير المركز", identifier: "medium-manager", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "طبيب", identifier: "medium-doctor", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "مريض", identifier: "medium-patient", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "موظف استقبال", identifier: "medium-receptionist", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "ممرض", identifier: "medium-nurse", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "فني مختبر", identifier: "medium-lab", password: demoPassword },
    { group: "المركز الصحي", roleLabel: "صيدلي", identifier: "medium-pharmacist", password: demoPassword }
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

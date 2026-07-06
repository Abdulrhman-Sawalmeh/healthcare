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
  name: "نظام المركز الصحي المتوسط",
  shortName: "المركز الصحي المتوسط",
  description: "واجهة تشغيل محلية لإدارة الاستقبال، العيادات، ملفات الزيارات، الإحالات، المختبر، الصيدلية، وبوابة المرضى.",
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
    "/lab",
    "/pharmacy/prescriptions",
    "/pharmacy/dispensing",
    "/pharmacy/inventory",
    "/pharmacy/notifications",
    "/pharmacy/audit",
    "/referrals",
    "/prescription-verification",
    "/notifications"
  ],
  allowedCenterCode: "M002",
  apiUrl: "http://localhost:4100/api",
  storageKey: "healthcare.medium-center-web.token",
  loginEyebrow: "Medium Center System",
  loginTitle: "تسجيل الدخول إلى نظام المركز الصحي المتوسط",
  loginDescription: "ادخل برقم الهوية أو اسم الدخول أو البريد الإلكتروني حسب الدور الوظيفي.",
  dashboardLabel: "تشغيل المركز الصحي",
  feedLabel: "آخر المستجدات",
  feedTitle: "الإشعارات والتنبيهات",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي المتوسط.",
  demoAccounts: [
    { group: "المركز الصحي المتوسط", roleLabel: "مدير المركز", identifier: "medium-manager", password: demoPassword },
    { group: "المركز الصحي المتوسط", roleLabel: "طبيب", identifier: "medium-doctor", password: demoPassword },
    { group: "المركز الصحي المتوسط", roleLabel: "مريض", identifier: "medium-patient", password: demoPassword },
    { group: "المركز الصحي المتوسط", roleLabel: "موظف استقبال", identifier: "medium-receptionist", password: demoPassword },
    { group: "المركز الصحي المتوسط", roleLabel: "فني مختبر", identifier: "medium-lab", password: demoPassword },
    { group: "المركز الصحي المتوسط", roleLabel: "صيدلي", identifier: "medium-pharmacist", password: demoPassword }
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

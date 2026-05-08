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
  description:
    "نظام محلي مستقل للمركز الصحي الصغير يربط بين الاستقبال والعيادات والإحالات، مع بوابة مريض لحجز المواعيد وتسجيل الدخول برقم الهوية.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "PATIENT", "RECEPTIONIST"],
  allowedRoutes: ["/", "/appointments", "/medical-record", "/doctors", "/messages", "/patients", "/visits", "/referrals", "/notifications"],
  allowedCenterCode: "C001",
  apiUrl: "http://localhost:4200/api",
  storageKey: "healthcare.small-center-web.token",
  loginEyebrow: "نظام المركز الصحي الصغير",
  loginTitle: "واجهة خفيفة لإدارة العمل اليومي مع بوابة مريض مباشرة وواضحة.",
  loginDescription:
    "تخدم هذه الواجهة فرق الاستقبال والعيادات في إنشاء حساب المريض وإرسال كلمة المرور عبر رسالة نصية، مع حجز الموعد ومراجعة التقارير الطبية والإحالات.",
  dashboardLabel: "تشغيل المركز الصغير",
  feedLabel: "آخر المستجدات",
  feedTitle: "الإشعارات والتنبيهات",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي الصغير.",
  demoAccounts: [
    {
      group: "المركز الصحي الصغير",
      roleLabel: "مدير المركز",
      identifier: "manager.hussein",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "طبيب",
      identifier: "doctor.hussein",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "مريض",
      identifier: "402010101",
      password: "Password123!"
    },
    {
      group: "المركز الصحي الصغير",
      roleLabel: "موظف الاستقبال",
      identifier: "reception.hussein",
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

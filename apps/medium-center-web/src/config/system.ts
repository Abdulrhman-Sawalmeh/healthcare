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
  description:
    "نظام محلي مستقل لإدارة المرضى والزيارات والمختبر والصيدلية والإحالات مع تكامل منظم مع النظام المركزي.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "LAB_TECH", "PHARMACIST", "NURSE"],
  allowedRoutes: ["/", "/patients", "/visits", "/referrals", "/lab", "/pharmacy", "/notifications"],
  allowedCenterCode: "M002",
  apiUrl: "http://localhost:4100/api",
  storageKey: "healthcare.medium-center-web.token",
  loginEyebrow: "نظام المركز الصحي المتوسط",
  loginTitle: "إدارة سريرية وتشغيلية متكاملة للمركز الصحي المتوسط.",
  loginDescription:
    "تدعم هذه الواجهة الاستقبال والعيادات والتمريض والمختبر والصيدلية، مع استقبال الإحالات من المراكز الأصغر ومزامنة البيانات مع النظام المركزي.",
  dashboardLabel: "تشغيل المركز المتوسط",
  feedLabel: "الإشعارات المحلية",
  feedTitle: "أحدث العناصر التشغيلية",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى نظام المركز الصحي المتوسط.",
  demoAccounts: [
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "مدير المركز",
      identifier: "manager.shifaa",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "طبيب",
      identifier: "doctor.shifaa",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "موظف الاستقبال",
      identifier: "reception.shifaa",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "فني مختبر",
      identifier: "lab.shifaa",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "صيدلي",
      identifier: "pharmacy.shifaa",
      password: "Password123!"
    },
    {
      group: "المركز الصحي المتوسط",
      roleLabel: "ممرض",
      identifier: "nurse.shifaa",
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

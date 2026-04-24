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
    "نظام محلي مستقل للمركز الصحي الصغير يركز على الاستقبال والعيادات والزيارات والإحالات مع مزامنة مرحلية مع النظام المركزي.",
  workspace: "center",
  allowedRoles: ["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"],
  allowedRoutes: ["/", "/patients", "/visits", "/referrals", "/notifications"],
  allowedCenterCode: "C001",
  apiUrl: "http://localhost:4200/api",
  storageKey: "healthcare.small-center-web.token",
  loginEyebrow: "نظام المركز الصحي الصغير",
  loginTitle: "واجهة خفيفة لإدارة الاستقبال والعيادات والإحالات في المركز الصحي الصغير.",
  loginDescription:
    "تخدم هذه الواجهة المراكز ذات البنية التشغيلية الأبسط، مع الحفاظ على التكامل مع السجل الموحد والإحالات الذكية عبر النظام المركزي.",
  dashboardLabel: "تشغيل المركز الصغير",
  feedLabel: "الإشعارات المحلية",
  feedTitle: "آخر التنبيهات التشغيلية",
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
      roleLabel: "موظف الاستقبال",
      identifier: "reception.hussein",
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

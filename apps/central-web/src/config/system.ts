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
  shortName: "الشبكة الصحية المركزية",
  description:
    "المرجع المركزي للمرضى الموحدين والإحالات الذكية والبيانات المرجعية الطبية والتواصل بين المراكز.",
  workspace: "central",
  allowedRoles: ["CENTRAL_ADMIN"],
  allowedRoutes: ["/", "/centers", "/patients", "/referrals", "/master-data", "/reports", "/notifications"],
  apiUrl: "http://localhost:4000/api",
  storageKey: "healthcare.central-web.token",
  loginEyebrow: "منصة الشبكة الصحية",
  loginTitle: "لوحة التحكم المركزية لإدارة المرضى والإحالات والتكامل بين المراكز الصحية.",
  loginDescription:
    "تجمع هذه الواجهة السجل الصحي الموحد، وتدير الإحالات الطبية بين المراكز، وتوزع القوائم المرجعية الطبية على الأنظمة المحلية.",
  dashboardLabel: "طبقة التنسيق المركزية",
  feedLabel: "سجل الإشعارات",
  feedTitle: "أحدث عناصر الطوابير",
  accessDeniedMessage: "هذا الحساب لا ينتمي إلى النظام المركزي.",
  demoAccounts: [
    {
      group: "النظام المركزي",
      roleLabel: "مدير النظام المركزي",
      identifier: "central.admin",
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

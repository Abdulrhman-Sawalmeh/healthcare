import { Role } from "../types";

export interface NavigationItem {
  to: string;
  label: string;
  roles: Role[];
}

const allCenterRoles: Role[] = [
  "CENTER_MANAGER",
  "DOCTOR",
  "RECEPTIONIST",
  "LAB_TECH",
  "PHARMACIST",
  "NURSE"
];

const prescriptionVerificationRoles: Role[] = allCenterRoles.filter(
  (role) => role !== "RECEPTIONIST" && role !== "LAB_TECH"
);

export const navigationItems: NavigationItem[] = [
  { to: "/ai-assistant", label: "المساعد الذكي", roles: ["PATIENT", ...allCenterRoles] },
  { to: "/", label: "لوحة المتابعة", roles: ["CENTRAL_ADMIN", ...allCenterRoles] },
  { to: "/appointments", label: "المواعيد", roles: ["PATIENT", "DOCTOR"] },
  { to: "/medical-record", label: "السجل الصحي", roles: ["PATIENT"] },
  { to: "/doctors", label: "الأطباء", roles: ["PATIENT", "CENTER_MANAGER"] },
  { to: "/messages", label: "المحادثة الطبية", roles: ["PATIENT", "DOCTOR"] },
  { to: "/centers", label: "المراكز", roles: ["CENTRAL_ADMIN"] },
  { to: "/patients", label: "المرضى", roles: ["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"] },
  { to: "/visits", label: "الزيارات", roles: ["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"] },
  { to: "/visit-workflow", label: "ملفات الزيارة والمتابعة", roles: allCenterRoles.filter((role) => role !== "LAB_TECH") },
  { to: "/lab", label: "طلبات المختبر", roles: ["LAB_TECH"] },
  { to: "/referrals", label: "الإحالات", roles: ["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"] },
  { to: "/prescription-verification", label: "التحقق من الوصفات", roles: prescriptionVerificationRoles },
  { to: "/master-data", label: "البيانات المرجعية", roles: ["CENTRAL_ADMIN"] },
  { to: "/reports", label: "التقارير", roles: ["CENTRAL_ADMIN"] },
  { to: "/notifications", label: "الإشعارات", roles: ["PATIENT", "CENTRAL_ADMIN", ...allCenterRoles] }
];

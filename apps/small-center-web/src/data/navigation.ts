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

export const navigationItems: NavigationItem[] = [
  {
    to: "/",
    label: "لوحة المتابعة",
    roles: ["CENTRAL_ADMIN", ...allCenterRoles]
  },
  {
    to: "/centers",
    label: "المراكز",
    roles: ["CENTRAL_ADMIN"]
  },
  {
    to: "/patients",
    label: "المرضى",
    roles: ["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]
  },
  {
    to: "/visits",
    label: "الزيارات",
    roles: ["CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]
  },
  {
    to: "/referrals",
    label: "الإحالات",
    roles: ["CENTRAL_ADMIN", "CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE"]
  },
  {
    to: "/lab",
    label: "المختبر",
    roles: ["CENTER_MANAGER", "DOCTOR", "LAB_TECH"]
  },
  {
    to: "/pharmacy",
    label: "الصيدلية",
    roles: ["CENTER_MANAGER", "PHARMACIST"]
  },
  {
    to: "/master-data",
    label: "البيانات المرجعية",
    roles: ["CENTRAL_ADMIN"]
  },
  {
    to: "/reports",
    label: "التقارير",
    roles: ["CENTRAL_ADMIN"]
  },
  {
    to: "/notifications",
    label: "الإشعارات",
    roles: ["CENTRAL_ADMIN", ...allCenterRoles]
  }
];

import { CenterUserRole, CentralCenterType, UserRole } from "@prisma/client";

export type PromptRole =
  | "CENTRAL_ADMIN"
  | CenterUserRole;

export type AppRole = UserRole | PromptRole;

export type AuthWorkspace = "central" | "center" | "legacy";

export interface SessionCenter {
  id: number;
  code: string;
  name: string;
  type: CentralCenterType;
  city: string;
  region: string;
  isConnected: boolean;
  hasLabModule: boolean;
  hasPharmacyModule: boolean;
}

export interface SessionUser {
  id: string;
  username: string;
  email?: string | null;
  fullName: string;
  role: AppRole;
  workspace: AuthWorkspace;
  center?: SessionCenter;
}

export function isPromptRole(role: AppRole): role is PromptRole {
  return [
    "CENTRAL_ADMIN",
    "CENTER_MANAGER",
    "DOCTOR",
    "RECEPTIONIST",
    "LAB_TECH",
    "PHARMACIST",
    "NURSE"
  ].includes(role as PromptRole);
}

export function hasCenterModules(centerType: CentralCenterType) {
  return {
    hasLabModule: centerType !== "CLINIC",
    hasPharmacyModule: centerType !== "CLINIC"
  };
}

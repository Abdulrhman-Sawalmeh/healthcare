export type UserRole = "ADMIN" | "DOCTOR" | "PATIENT";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  centerId?: string;
  centerName?: string;
  departmentName?: string;
}

export interface MetricCard {
  label: string;
  value: string | number;
  helper: string;
}

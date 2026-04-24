export type Role = "ADMIN" | "DOCTOR" | "PATIENT";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  centerId?: string;
  centerName?: string;
  patientProfileId?: string;
  doctorProfileId?: string;
  departmentName?: string;
}

export interface DashboardSummary {
  metrics: {
    activePatients: number;
    todayAppointments: number;
    pendingReferrals: number;
    averageWaitMinutes: number;
    adherenceRate: number;
    referralRate: number;
  };
}

export interface AppointmentItem {
  id: string;
  status: string;
  type: string;
  scheduledAt: string;
  reason: string;
  notes?: string;
  center: {
    id: string;
    name: string;
  };
  department: {
    id: string;
    name: string;
  };
  patient: {
    id: string;
    fullName: string;
  };
  doctor: {
    id: string;
    fullName: string;
    specialization: string;
  };
}

export interface ThreadRecord {
  id: string;
  updatedAt: string;
  patient: {
    id: string;
    fullName: string;
  };
  doctor: {
    id: string;
    fullName: string;
    departmentName: string;
  };
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    sender: {
      id: string;
      fullName: string;
      role: Role;
    };
  }>;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface SubscriptionRecord {
  id: string;
  status: string;
  startedAt: string;
  endsAt: string;
  plan: {
    id: string;
    name: string;
    billingCycle: string;
    priceInCents: number;
  };
  center: {
    id: string;
    name: string;
  };
}

export interface DoctorRecord {
  id: string;
  fullName: string;
  specialization: string;
  department: {
    id: string;
    name: string;
  };
}

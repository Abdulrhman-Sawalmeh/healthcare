export type Role =
  | "CENTER_MANAGER"
  | "DOCTOR"
  | "PATIENT"
  | "RECEPTIONIST"
  | "LAB_TECH"
  | "PHARMACIST"
  | "NURSE";

export interface SessionUser {
  id: string;
  username: string;
  email?: string | null;
  fullName: string;
  role: Role;
  workspace: "center" | "legacy";
  phone?: string | null;
  patientProfileId?: string;
  doctorProfileId?: string;
  center?: {
    id: number | string;
    code: string;
    name: string;
    city: string;
  };
}

export interface CenterDashboard {
  stats: {
    localPatients: number;
    unsyncedVisits: number;
    openReferrals: number;
    labOpenRequests: number;
    lowStockItems: number;
  };
  recentVisits: Array<{
    id: number;
    patientName: string;
    doctorName: string;
    diagnosis: string;
    visitDate: string;
    syncState: string;
  }>;
}

export interface PortalSummary {
  stats: {
    upcomingAppointments: number;
    completedReports: number;
    activeReferrals: number;
    unreadNotifications: number;
    activeSubscriptions: number;
  };
  nextAppointment: AppointmentItem | null;
  recentNotifications: NotificationRecord[];
  subscriptions: SubscriptionRecord[];
}

export interface AppointmentItem {
  id: string;
  status: string;
  type: string;
  scheduledAt: string;
  reason: string;
  doctor: { id: string; fullName: string; specialization: string };
  department: { id: string; name: string };
  center: { id: string; name: string };
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
  plan: { id: string; name: string; billingCycle: string; priceInCents: number };
  center: { id: string; name: string };
}

export interface DoctorRecord {
  id: string;
  fullName: string;
  specialization: string;
  department: { id: string; name: string };
}

export interface ThreadRecord {
  id: string;
  updatedAt: string;
  patient: { id: string; fullName: string };
  doctor: { id: string; fullName: string; departmentName: string };
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
    sender: { id: string; fullName: string; role: string };
  }>;
}

export interface WorkflowVisit {
  id: number;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  uploadStatus: string;
  diagnosis?: string;
  symptoms?: string | null;
  patient: { fullName: string; phone: string };
  doctor?: { fullName: string } | null;
  invoice?: { amount: number; paidAmount: number; status: string } | null;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    quantity: number;
    dispensed: boolean;
  }>;
  labRequests?: Array<{
    id: number;
    status: string;
    resultValue?: string | null;
    test: { testName: string };
  }>;
}

export interface IntakeOptions {
  patients: Array<{ id: number; fullName: string; phone: string }>;
  doctors: Array<{ id: number; fullName: string }>;
}

export interface Catalogs {
  medicines: Array<{ id: number; medicineName: string; quantity: number; unit: string; sellingPrice: number }>;
  labTests: Array<{ id: number; testName: string; price: number }>;
  diseases: Array<{ id: number; name: string; category: string }>;
}

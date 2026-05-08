export type Workspace = "central" | "center" | "legacy";

export type Role =
  | "CENTRAL_ADMIN"
  | "CENTER_MANAGER"
  | "DOCTOR"
  | "PATIENT"
  | "RECEPTIONIST"
  | "LAB_TECH"
  | "PHARMACIST"
  | "NURSE";

export interface SessionCenter {
  id: string | number;
  code: string;
  name: string;
  type: "CLINIC" | "MEDICAL_CENTER" | "HOSPITAL";
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
  role: Role;
  workspace: Workspace;
  center?: SessionCenter;
  phone?: string | null;
  patientProfileId?: string;
  doctorProfileId?: string;
  departmentName?: string;
}

export interface CentralDashboardData {
  stats: {
    connectedCenters: number;
    suspendedCenters: number;
    unifiedPatients: number;
    pendingReferrals: number;
    pendingCentralNotifications: number;
    pendingOutgoingNotifications: number;
  };
  centers: Array<{
    id: number;
    code: string;
    name: string;
    type: string;
    region: string;
    city: string;
    isConnected: boolean;
    specialties: string[];
    lastSyncAt?: string;
    currentPatientLoad: number;
    averageWaitTime: number;
    availableSpecialtySlots: number;
    patientCount: number;
    localVisitCount: number;
    pendingIncoming: number;
    pendingOutgoing: number;
  }>;
  recentReferrals: Array<{
    id: number;
    patientName: string;
    patientUnifiedId: string;
    fromCenter: string;
    toCenter: string;
    requiredSpecialty: string;
    priority: string;
    status: string;
    estimatedWaitTimeMinutes?: number;
    requestedAt: string;
  }>;
  recentVisits: Array<{
    id: number;
    patientName: string;
    centerName: string;
    primaryDiagnosis: string;
    visitType: string;
    visitDate: string;
  }>;
  referralPipeline: Array<{
    status: string;
    count: number;
  }>;
}

export interface CenterWorkspaceData {
  role: Role;
  center: {
    id: number;
    code: string;
    name: string;
    type: string;
    city: string;
    region: string;
    isConnected: boolean;
    lastSyncAt?: string;
    averageWaitTime: number;
    currentPatientLoad: number;
    specialties: string[];
  };
  stats: {
    localPatients: number;
    unsyncedVisits: number;
    incomingPending: number;
    outgoingPending: number;
    openReferrals: number;
    labOpenRequests: number;
    lowStockItems: number;
  };
  team: Array<{
    id: number;
    fullName: string;
    role: Role;
    email?: string | null;
    phone?: string | null;
    isActive: boolean;
  }>;
  recentVisits: Array<{
    id: number;
    patientName: string;
    doctorName: string;
    visitType: string;
    diagnosis: string;
    visitDate: string;
    syncState: string;
    prescriptionCount: number;
  }>;
  referrals: Array<{
    id: number;
    patientName: string;
    fromCenter: string;
    toCenter: string;
    requiredSpecialty: string;
    priority: string;
    status: string;
    requestedAt: string;
  }>;
}

export interface CenterRecord {
  id: number;
  code: string;
  name: string;
  type: string;
  region: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  specialties: string[];
  isConnected: boolean;
  suspensionReason?: string | null;
  lastSyncAt?: string | null;
  availableDoctors: number;
  totalDoctors: number;
  operatingRooms?: {
    total: number;
    available: number;
    nextAvailableSlot?: string | null;
  } | null;
  currentLoad: number;
  averageWaitTime: number;
  referralsOut: number;
  referralsIn: number;
  patientCount: number;
}

export interface UnifiedPatientRecord {
  id: number;
  unifiedId: string;
  nationalId?: string | null;
  fullName: string;
  primaryPhone: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  bloodType?: string | null;
  allergies: string[];
  chronicDiseases: string[];
  visitCount: number;
  referralCount: number;
  centersSeenAt: Array<{
    centerId: number;
    centerCode: string;
    centerName: string;
  }>;
  recentVisits: Array<{
    id: number;
    centerName: string;
    primaryDiagnosis: string;
    visitType: string;
    visitDate: string;
  }>;
  recentReferrals: Array<{
    id: number;
    fromCenter: string;
    toCenter: string;
    status: string;
    priority: string;
    requestedAt: string;
  }>;
}

export interface LocalPatientRecord {
  id: number;
  unifiedId?: string | null;
  nationalId?: string | null;
  fullName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  bloodType?: string | null;
  emergencyContact?: string | null;
  chronicDiseases: string[];
  allergies: string[];
  createdLocally: boolean;
  visitCount: number;
  billingStatus: string;
  recentVisits: Array<{
    id: number;
    diagnosis: string;
    visitType: string;
    visitDate: string;
    syncState: string;
  }>;
}

export interface VisitRecord {
  id: number;
  patientName: string;
  patientUnifiedId?: string | null;
  doctorName: string;
  visitType: string;
  diagnosis: string;
  symptoms?: string | null;
  bloodPressure?: string | null;
  temperature?: number | null;
  heartRate?: number | null;
  visitDate: string;
  visitTime?: string | null;
  syncState: string;
  syncedToCentral: boolean;
  prescriptionCount: number;
  invoiceStatus: string;
}

export interface ReferralRecord {
  id: number;
  patientName?: string;
  patientUnifiedId?: string;
  fromCenter: string;
  toCenter: string;
  requiredSpecialty: string;
  priority: string;
  status: string;
  reason?: string;
  selectedCenterReason?: string | null;
  rejectionReason?: string | null;
  estimatedWaitTimeMinutes?: number | null;
  requestedAt: string;
  respondedAt?: string | null;
  notesFromSender?: string | null;
  notesFromReceiver?: string | null;
}

export interface MasterDataBundle {
  medicines: Array<{
    id: number;
    genericName: string;
    brandName: string;
    category: string;
    unit: string;
    isCritical: boolean;
    version: number;
    updatedAt: string;
  }>;
  labTests: Array<{
    id: number;
    testName: string;
    category: string;
    normalRange?: string | null;
    version: number;
    updatedAt: string;
  }>;
  specialties: Array<{
    id: number;
    specialtyName: string;
    description?: string | null;
    updatedAt: string;
  }>;
}

export interface ReportSummary {
  referralsByStatus: Array<{
    status: string;
    count: number;
  }>;
  visitsByCenter: Array<{
    centerId: number;
    centerName: string;
    visitCount: number;
  }>;
  notificationHealth: Array<{
    status: string;
    count: number;
  }>;
  centerLoad: Array<{
    centerId: number;
    centerName: string;
    currentPatientLoad: number;
    averageWaitTime: number;
  }>;
}

export interface LabBundle {
  catalog: Array<{
    id: number;
    testName: string;
    category: string;
    normalRange?: string | null;
    price: number;
  }>;
  requests: Array<{
    id: number;
    patientName: string;
    doctorName: string;
    testName: string;
    category: string;
    status: string;
    requestDate: string;
    resultValue?: string | null;
    resultDate?: string | null;
  }>;
}

export interface PharmacyItem {
  id: number;
  medicineName: string;
  batchNumber: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  sellingPrice: number;
  reorderLevel: number;
  isLowStock: boolean;
}

export interface CenterNotificationsBundle {
  incoming: Array<{
    id: number;
    notificationType: string;
    status: string;
    receivedAt: string;
    responseStatus?: string | null;
    responseError?: string | null;
  }>;
  outgoing: Array<{
    id: number;
    notificationType: string;
    status: string;
    createdAt: string;
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: string | null;
    lastError?: string | null;
  }>;
  alerts: Array<{
    id: number;
    title: string;
    message: string;
    severity: string;
    createdAt: string;
    isResolved: boolean;
  }>;
  logs: Array<{
    id: number;
    severity: string;
    message: string;
    createdAt: string;
  }>;
}

export interface CentralNotificationsBundle {
  outgoing: Array<{
    id: number;
    notificationType: string;
    status: string;
    createdAt: string;
    sentAt?: string | null;
    targetCenter: {
      centerName: string;
      centerCode: string;
    };
  }>;
  incoming: Array<{
    id: number;
    notificationType: string;
    status: string;
    receivedAt: string;
    fromCenter: {
      centerName: string;
      centerCode: string;
    };
    notes?: string | null;
  }>;
  communicationLogs: Array<{
    id: number;
    direction: string;
    notificationType: string;
    status: string;
    createdAt: string;
    center?: {
      centerName: string;
      centerCode: string;
    } | null;
    errorMessage?: string | null;
  }>;
}

export interface NetworkPatientSearchResult {
  found: boolean;
  patient?: {
    id: number;
    unifiedId: string;
    nationalId?: string | null;
    fullName: string;
    primaryPhone: string;
    address: string;
    chronicDiseases: string[];
  };
  localPatient?: {
    id: number;
    fullName: string;
    phone: string;
    nationalId?: string | null;
  };
  recentVisits?: Array<{
    id: number;
    centerName?: string;
    primaryDiagnosis?: string;
    visitDate?: string;
  }>;
}

export interface PortalPatientRecord {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  medicalRecordNumber: string;
  chronicConditions?: string | null;
  insuranceNumber?: string | null;
  center: {
    id: string;
    name: string;
  };
  appointmentsCount: number;
  referralsCount: number;
}

export interface PortalDoctorRecord {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  specialization: string;
  yearsExperience: number;
  center: {
    id: string;
    name: string;
  };
  department: {
    id: string;
    name: string;
  };
}

export interface PortalAppointmentRecord {
  id: string;
  status: string;
  type: string;
  scheduledAt: string;
  reason: string;
  notes?: string | null;
  waitingMinutes?: number | null;
  attended?: boolean | null;
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
    medicalRecordNumber: string;
  };
  doctor: {
    id: string;
    fullName: string;
    specialization: string;
  };
}

export interface PortalReferralRecord {
  id: string;
  status: string;
  reason: string;
  notes?: string | null;
  priority: string;
  createdAt: string;
  acceptedAt?: string | null;
  completedAt?: string | null;
  fromCenter: {
    id: string;
    name: string;
  };
  toCenter: {
    id: string;
    name: string;
  };
  patient: {
    id: string;
    fullName: string;
    medicalRecordNumber: string;
  };
  fromDoctor: {
    id: string;
    fullName: string;
  };
  toDoctor?: {
    id: string;
    fullName: string;
  } | null;
  department?: {
    id: string;
    name: string;
  } | null;
}

export interface PortalNotificationRecord {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

export interface PortalThreadRecord {
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
    isRead: boolean;
    sender: {
      id: string;
      fullName: string;
      role: string;
    };
  }>;
}

export interface PortalSubscriptionRecord {
  id: string;
  status: string;
  autoRenew: boolean;
  startedAt: string;
  endsAt: string;
  center: {
    id: string;
    name: string;
  };
  patient: {
    id: string;
    fullName: string;
  };
  plan: {
    id: string;
    name: string;
    billingCycle: string;
    priceInCents: number;
    maxVisits: number;
    description?: string | null;
  };
  payments: Array<{
    id: string;
    amountInCents: number;
    currency: string;
    status: string;
    method: string;
    reference?: string | null;
    paidAt?: string | null;
    createdAt: string;
  }>;
}

export interface PortalSummary {
  patient: PortalPatientRecord;
  stats: {
    upcomingAppointments: number;
    completedReports: number;
    activeReferrals: number;
    unreadNotifications: number;
    activeSubscriptions: number;
    careTeamCount: number;
  };
  nextAppointment: PortalAppointmentRecord | null;
  recentReports: PortalAppointmentRecord[];
  careTeam: PortalDoctorRecord[];
  recentThreads: PortalThreadRecord[];
  recentNotifications: PortalNotificationRecord[];
}

export interface PortalMedicalRecord {
  patient: PortalPatientRecord;
  profile: {
    dateOfBirth: string;
    gender: string;
    chronicConditions?: string | null;
    insuranceNumber?: string | null;
    emergencyContact?: string | null;
    center: {
      id: string;
      code: string;
      name: string;
      city: string;
      address: string;
    };
  };
  clinicalReports: PortalAppointmentRecord[];
  upcomingAppointments: PortalAppointmentRecord[];
  referrals: PortalReferralRecord[];
  subscriptions: PortalSubscriptionRecord[];
}

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

export type WorkDay =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

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
  financial: {
    invoices: {
      total: number;
      paid: number;
      outstanding: number;
      count: number;
      unpaidCount: number;
    };
    budget: {
      monthlyLimit: number;
      projectedSpend: number;
      remaining: number;
      utilizationRate: number;
    };
    expenses: {
      staff: number;
      medications: number;
      equipment: number;
      patients: number;
    };
  };
  team: Array<{
    id: number;
    fullName: string;
    role: Role;
    email?: string | null;
    phone?: string | null;
    isActive: boolean;
    specialization?: string | null;
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

export interface CenterDoctorAccountRecord {
  id: number;
  username: string;
  fullName: string;
  role: "DOCTOR";
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
  createdByName?: string | null;
  profile: {
    nationalId: string;
    gender: string;
    specialization: string;
    yearsExperience: number;
    licenseNumber: string;
    qualification?: string | null;
    shiftDays: WorkDay[];
    shiftStartTime: string;
    shiftEndTime: string;
    consultationRoom?: string | null;
    hireDate?: string | null;
    bio?: string | null;
    notes?: string | null;
  } | null;
}

export interface CenterDoctorsBundle {
  center: {
    id: number;
    code: string;
    name: string;
    specialties: string[];
  };
  specialtyOptions: string[];
  doctors: CenterDoctorAccountRecord[];
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

export type PatientTimelineEventType =
  | "appointment"
  | "diagnosis"
  | "prescription"
  | "lab_result"
  | "referral"
  | "refill_request"
  | "follow_up"
  | "note";

export interface PatientTimelineEvent {
  id: string;
  type: PatientTimelineEventType;
  title: string;
  description: string;
  date: string;
  createdBy: string;
  sourceTable: string;
  status?: string;
  source?: string;
}

export type PrescriptionWarningSeverity = "LOW" | "MEDIUM" | "HIGH";
export type PrescriptionWarningType = "ALLERGY" | "DRUG_CONFLICT";

export interface PrescriptionSafetyWarningRecord {
  prescriptionIndex: number;
  medicineName: string;
  warningType: PrescriptionWarningType;
  severity: PrescriptionWarningSeverity;
  message: string;
  conflictWith?: string | null;
}

export interface PatientLabTrendPoint {
  date: string;
  value: number;
  rawValue?: string | null;
}

export interface PatientLabTrend {
  testName: string | null;
  unit?: string | null;
  normalRange?: string | null;
  availableTests: string[];
  points: PatientLabTrendPoint[];
}

export type MedicationRefillStatus =
  | "REQUESTED"
  | "DOCTOR_APPROVED"
  | "PHARMACY_PREPARING"
  | "READY_FOR_PICKUP"
  | "COLLECTED"
  | "REJECTED";

export interface MedicationRefillRequestRecord {
  id: number;
  centerId: number;
  patientId: number;
  patientName: string;
  patientUnifiedId?: string | null;
  prescriptionId: number;
  medicineName: string;
  dosage: string;
  duration: string;
  instructions?: string | null;
  visitId: number;
  visitDate: string;
  doctorId?: number | null;
  doctorName?: string | null;
  pharmacyUserId?: number | null;
  pharmacyUserName?: string | null;
  requestedAt: string;
  status: MedicationRefillStatus;
  rejectionReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EligiblePrescriptionRecord {
  id: number;
  visitId: number;
  medicineName: string;
  dosage: string;
  duration: string;
  instructions?: string | null;
  issuedAt: string;
  dispensed: boolean;
  doctorId?: number | null;
  doctorName?: string | null;
  visitDate: string;
  latestRefillStatus?: MedicationRefillStatus | null;
}

export type FollowUpReminderStatus = "PENDING" | "DONE" | "CANCELLED" | "MISSED";

export interface FollowUpReminderRecord {
  id: number;
  centerId: number;
  patientId: number;
  patientName: string;
  patientUnifiedId?: string | null;
  doctorId: number;
  doctorName: string;
  visitId?: number | null;
  visitSummary?: string | null;
  visitDate?: string | null;
  dueDate: string;
  reason: string;
  status: FollowUpReminderStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface PatientTimelineBundle {
  patient: {
    id: number;
    fullName: string;
    unifiedId?: string | null;
    nationalId?: string | null;
    phone: string;
    gender: string;
    dateOfBirth: string;
    address: string;
    bloodType?: string | null;
    emergencyContact?: string | null;
    allergies: string[];
    chronicDiseases: string[];
    centersSeenAt: Array<{
      centerId: number;
      centerCode: string;
      centerName: string;
    }>;
    visitCount: number;
    labResultsCount: number;
    referralCount: number;
    refillRequestCount?: number;
    followUpReminderCount?: number;
    timelineCount: number;
    lastEventAt?: string | null;
  };
  events: PatientTimelineEvent[];
  refillRequests?: MedicationRefillRequestRecord[];
  followUpReminders?: FollowUpReminderRecord[];
}

export interface VisitRecord {
  id: number;
  patientId: number;
  doctorId?: number | null;
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
  notes?: string | null;
  reports: LocalVisitReportRecord[];
  prescriptions: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    duration: string;
    instructions?: string | null;
  }>;
}

export interface LocalVisitReportAttachment {
  fileName: string;
  mimeType: string;
  contentBase64: string;
}

export interface LocalVisitReportRecord {
  id: number;
  title: string;
  category: string;
  summary: string;
  reportUrl?: string | null;
  findings?: string | null;
  recommendations?: string | null;
  recommendedFollowUp?: string | null;
  shareWithPatient: boolean;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorSpecialization?: string | null;
  attachment?: LocalVisitReportAttachment | null;
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
    patientId: number;
    doctorId: number;
    testId: number;
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
  patientMatches?: Array<{
    id: number;
    unifiedId: string;
    nationalId?: string | null;
    fullName: string;
    primaryPhone: string;
    address: string;
    chronicDiseases: string[];
  }>;
  localMatches?: Array<{
    id: number;
    fullName: string;
    phone: string;
    nationalId?: string | null;
  }>;
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
    phone?: string | null;
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

export type AppointmentPriority = "NORMAL" | "URGENT" | "EMERGENCY";

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

export interface PortalReportAttachment {
  fileName: string;
  mimeType: string;
  contentBase64?: string | null;
}

export interface PortalClinicalReportRecord {
  id: string;
  status: string;
  type: string;
  scheduledAt: string;
  reason: string;
  notes?: string | null;
  source: "APPOINTMENT" | "RESULT_REPORT";
  summary?: string | null;
  reportUrl?: string | null;
  findings?: string | null;
  recommendations?: string | null;
  recommendedFollowUp?: string | null;
  attachment?: PortalReportAttachment | null;
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

export interface PortalAppointmentSuggestionRecord {
  scheduledAt: string;
  type: "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE" | "LAB";
  priority: AppointmentPriority;
  note: string;
  doctor: {
    id: string;
    fullName: string;
    specialization: string;
    department: {
      id: string;
      name: string;
    };
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
  status: "OPEN" | "CLOSED";
  closedAt?: string | null;
  closedById?: string | null;
  updatedAt: string;
  patient: {
    id: string;
    fullName: string;
    medicalRecordNumber: string;
    nationalId?: string | null;
    unifiedId?: string | null;
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
    attachment?: {
      fileName: string;
      mimeType: string;
      contentBase64: string;
      sizeBytes: number;
    } | null;
    sender: {
      id: string;
      fullName: string;
      role: string;
    };
  }>;
}

export interface PortalConversationPatientOption {
  id: string;
  fullName: string;
  phone?: string | null;
  medicalRecordNumber: string;
  nationalId?: string | null;
  unifiedId?: string | null;
  threadId?: string | null;
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

export interface PortalSubscriptionPlanRecord {
  id: string;
  centerId: string;
  name: string;
  description?: string | null;
  billingCycle: string;
  priceInCents: number;
  maxVisits: number;
  createdAt: string;
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
  recentReports: PortalClinicalReportRecord[];
  careTeam: PortalDoctorRecord[];
  recentThreads: PortalThreadRecord[];
  recentNotifications: PortalNotificationRecord[];
  subscriptions: PortalSubscriptionRecord[];
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
      phone?: string | null;
    };
  };
  clinicalReports: PortalClinicalReportRecord[];
  upcomingAppointments: PortalAppointmentRecord[];
  referrals: PortalReferralRecord[];
  subscriptions: PortalSubscriptionRecord[];
  medicationRefills?: MedicationRefillRequestRecord[];
  eligiblePrescriptions?: EligiblePrescriptionRecord[];
  followUpReminders?: FollowUpReminderRecord[];
}

export type AiCareInsightContext = "PATIENT_SELF_CARE" | "CLINICAL_TRIAGE" | "FOLLOW_UP";

export interface AiCareInsightRequest {
  message: string;
  patientAge?: number;
  gender?: string;
  chronicDiseases?: string;
  allergies?: string;
  currentMedications?: string;
  context?: AiCareInsightContext;
}

export interface AiCareInsightResponse {
  source: "openrouter" | "gemini" | "local-fallback";
  urgency: "LOW" | "ROUTINE" | "URGENT" | "EMERGENCY";
  summary: string;
  suggestedActions: string[];
  questionsForClinician: string[];
  redFlags: string[];
  selfCare: string[];
  disclaimer: string;
}

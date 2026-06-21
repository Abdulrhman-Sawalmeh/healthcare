export type Role =
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
  id: number | string;
  code: string;
  name: string;
  type?: string;
  city: string;
  region?: string;
  isConnected?: boolean;
  hasLabModule?: boolean;
  hasPharmacyModule?: boolean;
}

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
  departmentName?: string;
  center?: SessionCenter;
}

export interface CenterDashboard {
  role: Role;
  center: {
    id: number;
    code: string;
    name: string;
    type: string;
    city: string;
    region: string;
    isConnected: boolean;
    lastSyncAt?: string | null;
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
  financial?: {
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
  referrals: ReferralRecord[];
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
  } | null;
  localPatient?: {
    id: number;
    fullName: string;
    phone: string;
    nationalId?: string | null;
  } | null;
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

export interface CreatePatientResponse {
  success: boolean;
  unifiedId: string;
  patient: LocalPatientRecord;
  portalAccount?: {
    loginIdentifier: string;
    deliveryMethod: "TWILIO" | "WEBHOOK" | "OUTBOX";
    email: string | null;
    emailDeliveryMethod: "BREVO_API" | "SMTP" | "WEBHOOK" | "OUTBOX" | "SKIPPED";
    accountStatus: "CREATED" | "RESET";
  };
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

export type PatientConsentTargetType = "DOCTOR" | "CENTER";
export type PatientConsentScope = "BASIC_INFO" | "VISITS" | "LAB_RESULTS" | "PRESCRIPTIONS" | "FULL_SUMMARY";
export type PatientConsentStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface ConsentTargetOption {
  id: string;
  label: string;
  subtitle?: string | null;
}

export interface ConsentTargetsBundle {
  centers: ConsentTargetOption[];
  doctors: ConsentTargetOption[];
}

export interface PatientConsentRecord {
  id: number;
  patientId: number;
  targetType: PatientConsentTargetType;
  targetId: string;
  targetLabel?: string | null;
  scope: PatientConsentScope;
  status: PatientConsentStatus;
  expiresAt: string;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export interface PortalPatientRecord {
  id: string;
  fullName: string;
  email?: string | null;
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
  email?: string | null;
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

export interface AppointmentItem {
  id: string;
  status: string;
  type: string;
  scheduledAt: string;
  reason: string;
  notes?: string | null;
  waitingMinutes?: number | null;
  attended?: boolean | null;
  doctor: {
    id: string;
    fullName: string;
    specialization: string;
  };
  department: {
    id: string;
    name: string;
  };
  center: {
    id: string;
    name: string;
  };
  patient?: {
    id: string;
    fullName: string;
    medicalRecordNumber: string;
  };
}

export interface PortalAppointmentSuggestionRecord {
  scheduledAt: string;
  type: "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE" | "LAB";
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
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
  attachment?: {
    fileName: string;
    mimeType: string;
    contentBase64?: string | null;
  } | null;
  center: {
    id: string;
    name: string;
  };
  department: {
    id: string;
    name: string;
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

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  type: string;
  targetUrl?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface SubscriptionRecord {
  id: string;
  status: string;
  autoRenew: boolean;
  startedAt: string;
  endsAt: string;
  plan: {
    id: string;
    name: string;
    billingCycle: string;
    priceInCents: number;
    maxVisits?: number;
    description?: string | null;
  };
  center: {
    id: string;
    name: string;
  };
}

export interface SubscriptionPlanRecord {
  id: string;
  centerId: string;
  name: string;
  description?: string | null;
  billingCycle: string;
  priceInCents: number;
  maxVisits: number;
  createdAt: string;
}

export interface MessageAttachmentDraft {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
}

export interface ThreadRecord {
  id: string;
  status: "OPEN" | "CLOSED";
  closedAt?: string | null;
  closedById?: string | null;
  updatedAt: string;
  patient: {
    id: string;
    fullName: string;
    medicalRecordNumber?: string;
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
    isRead?: boolean;
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

export interface ConversationPatientOption {
  id: string;
  fullName: string;
  phone?: string | null;
  medicalRecordNumber: string;
  nationalId?: string | null;
  unifiedId?: string | null;
  threadId?: string | null;
}

export interface PortalSummary {
  patient: PortalPatientRecord;
  stats: {
    upcomingAppointments: number;
    completedReports: number;
    activeReferrals: number;
    unreadNotifications: number;
    activeSubscriptions: number;
    careTeamCount?: number;
  };
  nextAppointment: AppointmentItem | null;
  recentReports: PortalClinicalReportRecord[];
  careTeam: PortalDoctorRecord[];
  recentThreads: ThreadRecord[];
  recentNotifications: NotificationRecord[];
  subscriptions: SubscriptionRecord[];
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
  upcomingAppointments: AppointmentItem[];
  referrals: PortalReferralRecord[];
  subscriptions: SubscriptionRecord[];
  medicationRefills?: MedicationRefillRequestRecord[];
  eligiblePrescriptions?: EligiblePrescriptionRecord[];
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

export interface WorkflowVisit {
  id: number;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  uploadStatus: string;
  diagnosis?: string;
  symptoms?: string | null;
  visitType?: string;
  checkedInAt?: string;
  visitDate?: string;
  patient: {
    id?: number;
    fullName: string;
    phone: string;
    unifiedId?: string | null;
  };
  doctor?: {
    id?: number;
    fullName: string;
  } | null;
  invoice?: {
    amount: number;
    paidAmount: number;
    status: string;
  } | null;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    duration?: string;
    quantity: number;
    dispensed: boolean;
    verificationCode?: string | null;
  }>;
  labRequests?: Array<{
    id: number;
    status: string;
    resultValue?: string | null;
    test: {
      testName: string;
      normalRange?: string | null;
    };
  }>;
  nursingAssessments?: Array<{
    id: number;
    assessedAt: string;
    bloodPressure?: string | null;
    temperature?: number | null;
    heartRate?: number | null;
    notes?: string | null;
  }>;
}

export interface IntakeOptions {
  patients: Array<{
    id: number;
    fullName: string;
    phone: string;
    unifiedId?: string | null;
  }>;
  doctors: Array<{
    id: number;
    fullName: string;
  }>;
}

export interface Catalogs {
  medicines: Array<{
    id: number;
    medicineName: string;
    quantity: number;
    unit: string;
    sellingPrice: number;
  }>;
  labTests: Array<{
    id: number;
    testName: string;
    price: number;
    normalRange?: string | null;
  }>;
  diseases: Array<{
    id: number;
    name: string;
    category: string;
  }>;
}

export interface PrescriptionVerificationResult {
  authentic: boolean;
  qrValue: string;
  prescription: {
    id: number;
    verificationCode: string;
    issuedAt: string;
    medicineName: string;
    dosage: string;
    duration: string;
    quantity: number;
    instructions?: string | null;
    dispensed: boolean;
    visit: {
      id: number;
      visitDate: string;
      diagnosis: string;
      patientName: string;
      patientUnifiedId?: string | null;
      doctorName: string;
      centerName: string;
      centerCode: string;
    };
  } | null;
}

export interface AuditLogRecord {
  id: number;
  action: string;
  entityType: string;
  entityId?: number | null;
  createdAt: string;
  newValue?: unknown;
  center?: {
    centerName: string;
    centerCode: string;
  } | null;
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

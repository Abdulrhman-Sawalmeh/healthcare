import { apiRequest } from "../api/client";
import {
  AiCareInsightRequest,
  AiCareInsightResponse,
  AppointmentItem,
  AuditLogRecord,
  Catalogs,
  CenterDashboard,
  CenterDoctorsBundle,
  CenterNotificationsBundle,
  ConversationPatientOption,
  CreatePatientResponse,
  IntakeOptions,
  LocalPatientRecord,
  MessageAttachmentDraft,
  NetworkPatientSearchResult,
  NotificationRecord,
  PatientTimelineBundle,
  PortalAppointmentSuggestionRecord,
  PortalDoctorRecord,
  PortalMedicalRecord,
  PortalSummary,
  PrescriptionVerificationResult,
  ReferralRecord,
  Role,
  SubscriptionPlanRecord,
  SubscriptionRecord,
  ThreadRecord,
  VisitRecord,
  WorkflowVisit
} from "../types";

export const staffRoles: Role[] = [
  "CENTER_MANAGER",
  "DOCTOR",
  "RECEPTIONIST",
  "LAB_TECH",
  "PHARMACIST",
  "NURSE"
];

export const patientRole: Role = "PATIENT";

export function isStaffRole(role?: Role) {
  return Boolean(role && staffRoles.includes(role));
}

export function canManagePatients(role?: Role) {
  return role === "CENTER_MANAGER" || role === "DOCTOR" || role === "RECEPTIONIST";
}

export function canCreatePatients(role?: Role) {
  return role === "RECEPTIONIST";
}

export function canUseVisitWorkflow(role?: Role) {
  return isStaffRole(role);
}

export function canUseCenterReferrals(role?: Role) {
  return role === "CENTER_MANAGER" || role === "DOCTOR" || role === "RECEPTIONIST";
}

export function canUseCenterNotifications(role?: Role) {
  return role === "CENTER_MANAGER" || role === "DOCTOR" || role === "RECEPTIONIST";
}

export function canUseMessages(role?: Role) {
  return role === "PATIENT" || role === "DOCTOR";
}

export const mediumApi = {
  centerDashboard: () => apiRequest<CenterDashboard>("/center/dashboard"),
  portalSummary: () => apiRequest<PortalSummary>("/portal/summary"),
  portalMedicalRecord: () => apiRequest<PortalMedicalRecord>("/portal/medical-record"),

  appointments: () => apiRequest<AppointmentItem[]>("/portal/appointments"),
  appointmentSuggestions: (doctorId: string, preferredDate: string, appointmentType = "CLINIC") =>
    apiRequest<PortalAppointmentSuggestionRecord[]>(
      `/portal/appointments/suggestions?doctorId=${encodeURIComponent(doctorId)}&preferredDate=${encodeURIComponent(
        preferredDate
      )}&appointmentType=${encodeURIComponent(appointmentType)}&priority=NORMAL`
    ),
  createAppointment: (payload: {
    doctorId: string;
    departmentId: string;
    scheduledAt: string;
    type: string;
    reason: string;
    notes?: string;
  }) =>
    apiRequest<AppointmentItem>("/portal/appointments", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  cancelAppointment: (appointmentId: string) =>
    apiRequest<AppointmentItem>(`/portal/appointments/${appointmentId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "CANCELLED" })
    }),

  portalDoctors: () => apiRequest<PortalDoctorRecord[]>("/portal/doctors"),
  centerDoctors: () => apiRequest<CenterDoctorsBundle>("/center/doctors"),
  createCenterDoctor: (payload: Record<string, unknown>) =>
    apiRequest("/center/doctors", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteCenterDoctor: (doctorId: number) =>
    apiRequest(`/center/doctors/${doctorId}`, {
      method: "DELETE"
    }),

  centerPatients: (search?: string) =>
    apiRequest<LocalPatientRecord[]>(`/center/patients${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  searchCenterPatient: (term: string, limit = 8) =>
    apiRequest<NetworkPatientSearchResult>(
      `/center/patients/search?term=${encodeURIComponent(term)}&limit=${encodeURIComponent(String(limit))}`
    ),
  createCenterPatient: (payload: {
    fullName: string;
    nationalId: string;
    dateOfBirth: string;
    gender: string;
    primaryPhone: string;
    address: string;
    emergencyContact?: string;
    bloodType?: string;
    allergies: string[];
    chronicDiseases: string[];
  }) =>
    apiRequest<CreatePatientResponse>("/center/patients", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  patientTimeline: (patientId: number) => apiRequest<PatientTimelineBundle>(`/patients/${patientId}/timeline`),

  visits: () => apiRequest<VisitRecord[]>("/center/visits"),

  workflowVisits: (status?: string) =>
    apiRequest<WorkflowVisit[]>(`/center/visit-workflow${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  workflowIntakeOptions: () => apiRequest<IntakeOptions>("/center/visit-workflow/intake-options"),
  workflowCatalogs: () => apiRequest<Catalogs>("/center/visit-workflow/catalogs"),
  createWorkflowVisit: (payload: {
    patientId: number;
    doctorId?: number;
    visitDate: string;
    visitTime?: string;
    visitType: string;
    priority: string;
    symptoms?: string;
    notes?: string;
  }) =>
    apiRequest<WorkflowVisit>("/center/visit-workflow", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  saveTriage: (visitId: number, payload: Record<string, unknown>) =>
    apiRequest(`/center/visit-workflow/${visitId}/triage`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  saveDoctorAssessment: (visitId: number, payload: Record<string, unknown>) =>
    apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  saveLabResult: (requestId: number, payload: Record<string, unknown>) =>
    apiRequest(`/center/visit-workflow/lab/${requestId}/result`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  dispensePrescription: (prescriptionId: number) =>
    apiRequest(`/center/visit-workflow/prescriptions/${prescriptionId}/dispense`, { method: "PATCH" }),
  completeWorkflowVisit: (visitId: number) =>
    apiRequest(`/center/visit-workflow/${visitId}/complete`, { method: "POST" }),
  uploadWorkflowVisit: (visitId: number) =>
    apiRequest(`/center/visit-workflow/${visitId}/upload`, { method: "POST" }),

  centerReferrals: () => apiRequest<ReferralRecord[]>("/center/referrals"),
  requestCenterReferral: (payload: {
    localPatientId?: number;
    patientUnifiedId?: string;
    requiredSpecialty: string;
    priority: string;
    reason: string;
    requiresOr?: boolean;
    preferredRegion?: string;
    maxDistanceKm?: number;
    notesFromSender?: string;
    processNow?: boolean;
  }) =>
    apiRequest("/center/referrals/request", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  centerNotifications: () => apiRequest<CenterNotificationsBundle>("/center/notifications"),
  processCenterNotifications: () => apiRequest("/center/notifications/process", { method: "POST" }),
  retryCenterNotification: (notificationId: number) =>
    apiRequest(`/center/notifications/retry/${notificationId}`, { method: "POST" }),
  portalNotifications: () => apiRequest<NotificationRecord[]>("/portal/notifications"),
  markPortalNotificationRead: (notificationId: string) =>
    apiRequest<NotificationRecord>(`/portal/notifications/${notificationId}/read`, { method: "PATCH" }),

  threads: () => apiRequest<ThreadRecord[]>("/portal/communications/threads"),
  conversationPatients: () => apiRequest<ConversationPatientOption[]>("/portal/communications/patient-options"),
  createThread: (payload: { doctorId?: string; patientId?: string; initialMessage?: string }) =>
    apiRequest<ThreadRecord>("/portal/communications/threads", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  sendMessage: (threadId: string, content: string, attachment?: MessageAttachmentDraft | null) =>
    apiRequest<ThreadRecord>(`/portal/communications/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, ...(attachment ? { attachment } : {}) })
    }),
  markThreadRead: (threadId: string) =>
    apiRequest<ThreadRecord>(`/portal/communications/threads/${threadId}/read`, { method: "PATCH" }),
  updateThreadStatus: (threadId: string, status: "OPEN" | "CLOSED") =>
    apiRequest<ThreadRecord>(`/portal/communications/threads/${threadId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),

  subscriptionPlans: () => apiRequest<SubscriptionPlanRecord[]>("/portal/subscriptions/plans"),
  activateSubscription: (payload: { planId: string; securePaymentToken: string; autoRenew: boolean; method: string }) =>
    apiRequest<SubscriptionRecord>("/portal/subscriptions/activate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  verifyPrescription: (code: string) =>
    apiRequest<PrescriptionVerificationResult>(`/center/prescriptions/verify/${encodeURIComponent(code.trim())}`),
  auditLogs: (limit = 12) => apiRequest<AuditLogRecord[]>(`/center/audit-logs?limit=${limit}`),

  aiCapabilities: () =>
    apiRequest<{ features: string[]; model: string; fallback: boolean; provider: "openrouter" | "gemini" | "local" }>(
      "/ai/capabilities"
    ),
  careInsights: (payload: AiCareInsightRequest) =>
    apiRequest<AiCareInsightResponse>("/ai/care-insights", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

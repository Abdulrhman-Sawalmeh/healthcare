import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ApiError, apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { PrescriptionSafetyWarningRecord } from "../types";

type WorkflowVisit = {
  id: number;
  visitDate?: string | null;
  visitTime?: string | null;
  visitType?: string | null;
  symptoms?: string | null;
  notes?: string | null;
  bloodPressure?: string | null;
  temperature?: number | null;
  heartRate?: number | null;
  checkedInAt?: string | null;
  priority: "NORMAL" | "URGENT" | "EMERGENCY";
  workflowStatus: string;
  uploadStatus: string;
  uploadError?: string | null;
  diagnosis?: string | null;
  patient: { id: number; fullName: string; phone: string; unifiedId?: string | null };
  doctor?: { id?: number; fullName: string } | null;
  invoice?: { amount: number; paidAmount: number; status?: string | null } | null;
  workflowTasks?: Array<{
    id: number;
    taskType: string;
    status: string;
    assignedRole?: string | null;
    instructions?: string | null;
    resultSummary?: string | null;
    completedAt?: string | null;
  }>;
  nursingAssessments?: Array<{
    id: number;
    bloodPressure?: string | null;
    temperature?: number | null;
    heartRate?: number | null;
    weightKg?: number | null;
    heightCm?: number | null;
    oxygenSaturation?: number | null;
    respiratoryRate?: number | null;
    bloodGlucose?: number | null;
    notes?: string | null;
    assessedAt?: string | null;
  }>;
  prescriptions?: Array<{
    id: number;
    medicineName: string;
    dosage: string;
    duration?: string | null;
    quantity: number;
    instructions?: string | null;
    dispensed: boolean;
    dispensedAt?: string | null;
    pharmacyStatus?: string;
    availabilityStatus?: string;
    doctorReviewReason?: string | null;
    doctorReviewResponse?: string | null;
    pharmacyUpdatedAt?: string | null;
  }>;
  labRequests?: Array<{
    id: number;
    status: string;
    priority?: string | null;
    requestDate?: string | null;
    resultValue?: string | null;
    resultNotes?: string | null;
    unit?: string | null;
    normalRange?: string | null;
    abnormalFlag?: string | null;
    criticalNote?: string | null;
    reportUrl?: string | null;
    imageUrl?: string | null;
    doctorNotes?: string | null;
    patientNotes?: string | null;
    correctionReason?: string | null;
    resultFileName?: string | null;
    resultMimeType?: string | null;
    resultDate?: string | null;
    sentToDoctorAt?: string | null;
    publishedToPatientAt?: string | null;
    resultReport?: {
      id: number;
      title: string;
      reportUrl?: string | null;
      shareWithPatient: boolean;
    } | null;
    test: { testName: string; category?: string | null };
  }>;
  resultReports?: Array<{
    id: number;
    title: string;
    category: string;
    summary: string;
    reportUrl?: string | null;
    shareWithPatient: boolean;
    createdAt: string;
    author: {
      fullName: string;
      doctorProfile?: {
        specialization: string;
      } | null;
    };
  }>;
};

type IntakeOptions = {
  patients: Array<{ id: number; fullName: string; phone: string; unifiedId?: string | null }>;
  doctors: Array<{ id: number; fullName: string }>;
};

type Catalogs = {
  medicines: Array<{ id: number; medicineName: string; quantity: number; unit: string; sellingPrice: number }>;
  labTests: Array<{ id: number; testName: string; category: string; price: number }>;
  diseases: Array<{ id: number; name: string; category: string }>;
};

type PrescriptionDraft = {
  key: number;
  medicineId?: number;
  medicineName: string;
  dosage: string;
  quantity: number;
  duration: string;
  instructions: string;
  note: string;
};

type LabRequestDraft = {
  key: number;
  testId: number | "";
  reason: string;
  clinicalNotes: string;
};

function createPrescriptionDraft(): PrescriptionDraft {
  return {
    key: Date.now() + Math.random(),
    medicineId: undefined,
    medicineName: "",
    dosage: "",
    quantity: 1,
    duration: "",
    instructions: "",
    note: ""
  };
}

function createLabRequestDraft(): LabRequestDraft {
  return {
    key: Date.now() + Math.random(),
    testId: "",
    reason: "",
    clinicalNotes: ""
  };
}

const pharmacyStatusLabels: Record<string, string> = {
  NEW: "وصفة جديدة",
  UNDER_REVIEW: "قيد المراجعة",
  PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهزة للاستلام",
  DISPENSED: "تم الصرف",
  UNAVAILABLE: "غير متوفر",
  NEEDS_DOCTOR_REVIEW: "تحتاج مراجعة الطبيب",
  CANCELLED: "ملغاة"
};

const statusLabels: Record<string, string> = {
  WAITING_RECEPTION: "بانتظار الاستقبال",
  WAITING_TRIAGE: "بانتظار التقييم التمريضي",
  WAITING_DOCTOR: "بانتظار الطبيب",
  WAITING_LAB: "بانتظار المختبر",
  WAITING_PHARMACY: "بانتظار الصيدلية",
  IN_TREATMENT: "قيد المعالجة",
  READY_TO_UPLOAD: "جاهز للرفع",
  UPLOAD_PENDING: "قيد الرفع",
  UPLOADED: "تم الرفع",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي"
};

const priorityLabels: Record<WorkflowVisit["priority"], string> = {
  NORMAL: "عادي",
  URGENT: "عاجل",
  EMERGENCY: "طارئ"
};

const uploadLabels: Record<string, string> = {
  NOT_READY: "غير جاهز",
  READY: "جاهز",
  QUEUED: "قيد الإرسال",
  FAILED: "فشل الرفع",
  UPLOADED: "تم الرفع"
};

const visitTypeLabels: Record<string, string> = {
  CONSULTATION: "استشارة",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طوارئ",
  LAB: "مختبر"
};

const reportCategoryOptions = [
  { value: "LAB", label: "نتائج المختبر" },
  { value: "RADIOLOGY", label: "نتائج الأشعة" },
  { value: "IMAGING", label: "صور طبية" },
  { value: "GENERAL", label: "تقرير طبي" },
  { value: "CARDIOLOGY", label: "قلب وتخطيط" },
  { value: "MICROBIOLOGY", label: "زراعة ومختبر" },
  { value: "PATHOLOGY", label: "أنسجة وخزعات" },
  { value: "PROCEDURE", label: "إجراء طبي" }
];

const defaultReportLinkForm = {
  title: "",
  category: "LAB",
  reportUrl: ""
};

const taskLabels: Record<string, string> = {
  RECEPTION_REGISTRATION: "تسجيل الاستقبال",
  NURSING_TRIAGE: "تقييم التمريض",
  DOCTOR_ASSESSMENT: "تقييم الطبيب",
  LAB_TEST: "فحوصات المختبر",
  PHARMACY_DISPENSING: "صرف الأدوية"
};

type LabRequest = NonNullable<WorkflowVisit["labRequests"]>[number];

const labStatusLabels: Record<string, string> = {
  NEW: "جديد",
  PENDING: "قيد الانتظار",
  PENDING_SAMPLE: "بانتظار العينة",
  SAMPLE_RECEIVED: "العينة مستلمة",
  IN_PROGRESS: "قيد الفحص",
  RESULT_READY: "النتيجة جاهزة",
  SENT_TO_DOCTOR: "أُرسلت للطبيب",
  NEEDS_CORRECTION: "تحتاج تصحيح",
  PUBLISHED_TO_PATIENT: "منشورة للمريض",
  INVALID_SAMPLE: "عينة غير صالحة",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
  NORMAL: "عادي",
  URGENT: "عاجل",
  CRITICAL: "حرج",
  ABNORMAL: "غير طبيعي"
};

const labPublishableStatuses = new Set(["COMPLETED"]);
const labReturnableStatuses = new Set(["SENT_TO_DOCTOR", "COMPLETED"]);

function labStatusLabel(status: string) {
  return labStatusLabels[status] ?? status;
}

function labResultSummary(request: LabRequest) {
  const structuredResult = [request.resultValue, request.unit].filter(Boolean).join(" ");

  if (structuredResult) return structuredResult;
  if (request.resultNotes) return request.resultNotes;
  if (request.reportUrl) return "رابط تقرير متاح";
  if (request.imageUrl) return "رابط صورة متاح";
  if (request.resultFileName) return `ملف مرفق: ${request.resultFileName}`;
  return "بانتظار النتيجة";
}

function labRequestDetails(request: LabRequest) {
  return [
    request.normalRange ? `المدى المرجعي: ${request.normalRange}` : null,
    request.abnormalFlag ? `التصنيف: ${labStatusLabel(request.abnormalFlag)}` : null,
    request.criticalNote ? `ملاحظة حرجة: ${request.criticalNote}` : null,
    request.correctionReason ? `سبب التصحيح: ${request.correctionReason}` : null,
    request.patientNotes ? `للمريض: ${request.patientNotes}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function labRequestMeta(request: LabRequest) {
  return [
    request.priority ? labStatusLabel(request.priority) : null,
    request.requestDate ? `طلب: ${formatDateTime(request.requestDate)}` : null,
    request.sentToDoctorAt ? `إرسال للطبيب: ${formatDateTime(request.sentToDoctorAt)}` : null,
    request.publishedToPatientAt ? `نشر للمريض: ${formatDateTime(request.publishedToPatientAt)}` : null
  ]
    .filter(Boolean)
    .join(" | ");
}

function canPublishLabRequest(request: LabRequest) {
  return labPublishableStatuses.has(request.status) && !request.publishedToPatientAt;
}

function canReturnLabRequestForCorrection(request: LabRequest) {
  return labReturnableStatuses.has(request.status) && !request.publishedToPatientAt;
}

function optionalNumber(value: FormDataEntryValue | null) {
  return value ? Number(value) : undefined;
}

function hasRole(role: string | undefined, allowed: string[]) {
  return Boolean(role && allowed.includes(role));
}

function valueOrDash(value?: string | number | null) {
  return value === undefined || value === null || value === "" ? "غير مسجل" : String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ar");
}

function formatDateTime(value?: string | null) {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ar");
}

function priorityClass(priority: WorkflowVisit["priority"]) {
  if (priority === "EMERGENCY") return "danger";
  if (priority === "URGENT") return "warning";
  return "neutral";
}

function statusClass(status: string) {
  if (["COMPLETED", "UPLOADED", "READY_TO_UPLOAD"].includes(status)) return "success";
  if (["WAITING_LAB", "WAITING_PHARMACY", "WAITING_TRIAGE", "WAITING_DOCTOR"].includes(status)) return "warning";
  if (["CANCELLED", "FAILED"].includes(status)) return "danger";
  return "neutral";
}

function reportCategoryLabel(category: string) {
  return reportCategoryOptions.find((option) => option.value === category)?.label ?? category;
}

function patientNumber(visit: WorkflowVisit) {
  return visit.patient.unifiedId || visit.patient.phone || `زيارة ${visit.id}`;
}

function reportDepartment(report: NonNullable<WorkflowVisit["resultReports"]>[number]) {
  return report.author.doctorProfile?.specialization ?? reportCategoryLabel(report.category);
}

function extractPrescriptionWarnings(cause: unknown) {
  if (!(cause instanceof ApiError)) {
    return [];
  }

  const payload = cause.payload as { warnings?: PrescriptionSafetyWarningRecord[] } | undefined;
  return Array.isArray(payload?.warnings) ? payload.warnings : [];
}

function hasHighSeverityWarning(warnings: PrescriptionSafetyWarningRecord[]) {
  return warnings.some((warning) => warning.severity === "HIGH");
}

export function VisitWorkflowPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const role = user?.role;
  const [visits, setVisits] = useState<WorkflowVisit[]>([]);
  const [intake, setIntake] = useState<IntakeOptions>({ patients: [], doctors: [] });
  const [catalogs, setCatalogs] = useState<Catalogs>({ medicines: [], labTests: [], diseases: [] });
  const [status, setStatus] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reportLinkForm, setReportLinkForm] = useState(defaultReportLinkForm);
  const [prescriptionWarnings, setPrescriptionWarnings] = useState<PrescriptionSafetyWarningRecord[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [doctorPrescriptionRows, setDoctorPrescriptionRows] = useState<PrescriptionDraft[]>([]);
  const [doctorLabRows, setDoctorLabRows] = useState<LabRequestDraft[]>([]);
  const [pendingDoctorSubmission, setPendingDoctorSubmission] = useState<{
    visitId: number;
    payload: Record<string, unknown>;
  } | null>(null);

  const canIntake = hasRole(role, ["RECEPTIONIST"]);
  const canAssess = hasRole(role, ["DOCTOR"]);
  const canViewReception = hasRole(role, ["CENTER_MANAGER", "RECEPTIONIST", "DOCTOR"]);
  const canViewNursing = hasRole(role, ["CENTER_MANAGER", "DOCTOR", "NURSE"]);
  const canViewDoctor = hasRole(role, ["CENTER_MANAGER", "DOCTOR"]);
  const canViewLab = hasRole(role, ["CENTER_MANAGER", "DOCTOR", "LAB_TECH"]);
  const canViewPharmacy = hasRole(role, ["CENTER_MANAGER", "DOCTOR"]);
  const canEditNursing = hasRole(role, ["NURSE"]);
  const canEditLab = hasRole(role, ["LAB_TECH"]);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? null,
    [selectedVisitId, visits]
  );
  const guidedAction = searchParams.get("action");
  const guidedFocus =
    searchParams.get("focus") === "prescription" || guidedAction === "create-prescription"
      ? "prescription"
      : searchParams.get("focus") === "lab" || guidedAction === "request-lab"
        ? "lab"
        : null;
  const guidedMessage =
    guidedFocus === "prescription"
      ? "اختر ملف المريض الذي تريد إنشاء وصفة له."
      : guidedFocus === "lab"
        ? "اختر ملف المريض الذي تريد طلب فحص مخبري له."
        : "";

  const canAddReportLink =
    Boolean(selectedVisit?.diagnosis) && selectedVisit?.diagnosis !== "بانتظار تقييم الطبيب";

  const loadVisits = useCallback(async () => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const loadedVisits = await apiRequest<WorkflowVisit[]>(`/center/visit-workflow${query}`);
    setVisits(loadedVisits);
    setSelectedVisitId((current) => (current && loadedVisits.some((visit) => visit.id === current) ? current : null));
  }, [status]);

  const loadPage = useCallback(async () => {
    try {
      setError("");
      const tasks: Promise<unknown>[] = [loadVisits()];
      if (canIntake || canAssess) {
        tasks.push(apiRequest<IntakeOptions>("/center/visit-workflow/intake-options").then(setIntake));
      }
      if (canAssess || role === "LAB_TECH") {
        tasks.push(apiRequest<Catalogs>("/center/visit-workflow/catalogs").then(setCatalogs));
      }
      await Promise.all(tasks);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملفات الزيارات.");
    }
  }, [canAssess, canIntake, loadVisits, role]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    setDoctorPrescriptionRows([]);
    setDoctorLabRows([]);
  }, [selectedVisitId]);

  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (!highlight?.startsWith("lab-result-") && !highlight?.startsWith("prescription-")) {
      return;
    }

    const targetId = Number(highlight.replace("lab-result-", "").replace("prescription-", ""));
    const visit = highlight.startsWith("lab-result-")
      ? visits.find((item) => item.labRequests?.some((request) => request.id === targetId))
      : visits.find((item) => item.prescriptions?.some((prescription) => prescription.id === targetId));

    if (!visit) {
      return;
    }

    setSelectedVisitId(visit.id);
    window.setTimeout(() => {
      document.getElementById(highlight)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  }, [searchParams, visits]);

  useEffect(() => {
    const requestedVisitId = Number(searchParams.get("visitId"));
    if (!Number.isInteger(requestedVisitId) || requestedVisitId <= 0) {
      return;
    }

    if (visits.some((visit) => visit.id === requestedVisitId)) {
      setSelectedVisitId(requestedVisitId);
    }
  }, [searchParams, visits]);

  useEffect(() => {
    if (!selectedVisitId || !guidedFocus) {
      return;
    }

    const sectionId = guidedFocus === "prescription" ? "doctor-prescription-section" : "doctor-lab-section";
    const controlId = guidedFocus === "prescription" ? "add-prescription-button" : "add-lab-request-button";

    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      document.getElementById(controlId)?.focus();
    }, 180);
  }, [guidedFocus, selectedVisitId]);

  async function runAction(visitId: number, action: () => Promise<unknown>, successMessage = "تم حفظ التغييرات.") {
    try {
      setBusyId(visitId);
      setError("");
      setMessage("");
      await action();
      setMessage(successMessage);
      await loadVisits();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تنفيذ العملية.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitDoctorPayload(
    visitId: number,
    payload: Record<string, unknown>,
    successMessage = "Doctor assessment was saved."
  ) {
    try {
      setBusyId(visitId);
      setError("");
      setMessage("");
      await apiRequest(`/center/visit-workflow/${visitId}/doctor`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setPrescriptionWarnings([]);
      setPendingDoctorSubmission(null);
      setOverrideReason("");
      setDoctorPrescriptionRows([]);
      setMessage(successMessage);
      await loadVisits();
    } catch (cause) {
      const warnings = extractPrescriptionWarnings(cause);

      if (warnings.length > 0) {
        setPrescriptionWarnings(warnings);
        setPendingDoctorSubmission({ visitId, payload });
        setError("");
        return;
      }

      setError(cause instanceof Error ? cause.message : "Unable to save doctor assessment.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      setBusyId(0);
      setError("");
      const createdVisit = await apiRequest<{ id: number }>("/center/visit-workflow", {
        method: "POST",
        body: JSON.stringify({
          patientId: Number(form.get("patientId")),
          doctorId: optionalNumber(form.get("doctorId")),
          visitDate: form.get("visitDate"),
          visitTime: form.get("visitTime") || undefined,
          visitType: form.get("visitType"),
          priority: form.get("priority"),
          symptoms: form.get("symptoms") || undefined,
          notes: form.get("notes") || undefined
        })
      });
      formElement.reset();
      setMessage("تم تسجيل الزيارة وإرسالها إلى مسار التقييم.");
      await loadVisits();
      setSelectedVisitId(createdVisit.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الزيارة.");
    } finally {
      setBusyId(null);
    }
  }

  function submitAssignDoctor(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/assign-doctor`, {
          method: "PATCH",
          body: JSON.stringify({ doctorId: Number(form.get("doctorId")) })
        }),
      "تم تعيين الطبيب لملف الزيارة."
    );
  }

  function submitTriage(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/triage`, {
          method: "PATCH",
          body: JSON.stringify({
            bloodPressure: form.get("bloodPressure") || undefined,
            temperature: optionalNumber(form.get("temperature")),
            heartRate: optionalNumber(form.get("heartRate")),
            weightKg: optionalNumber(form.get("weightKg")),
            heightCm: optionalNumber(form.get("heightCm")),
            oxygenSaturation: optionalNumber(form.get("oxygenSaturation")),
            respiratoryRate: optionalNumber(form.get("respiratoryRate")),
            bloodGlucose: optionalNumber(form.get("bloodGlucose")),
            notes: form.get("notes") || undefined
          })
        }),
      "تم حفظ تقييم التمريض وإرساله للطبيب."
    );
  }

  function submitDoctorAssessment(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const invalidRow = doctorPrescriptionRows.find(
      (row) =>
        !row.medicineName.trim() ||
        !row.dosage.trim() ||
        !row.duration.trim() ||
        !Number.isInteger(row.quantity) ||
        row.quantity < 1
    );

    if (invalidRow) {
      setError("أكمل اسم الدواء والجرعة والمدة والكمية لكل دواء مضاف، أو احذف الصف غير المكتمل.");
      return;
    }

    const invalidLabRow = doctorLabRows.find((row) => !row.testId);

    if (invalidLabRow) {
      setError("اختر فحصًا مخبريًا لكل طلب مضاف، أو احذف الصف غير المكتمل.");
      return;
    }

    const prescriptions = doctorPrescriptionRows.map((row) => {
      const inventoryItem =
        (row.medicineId
          ? catalogs.medicines.find((medicine) => medicine.id === row.medicineId)
          : undefined) ??
        catalogs.medicines.find(
          (medicine) => medicine.medicineName.trim().toLowerCase() === row.medicineName.trim().toLowerCase()
        );
      const instructions = [
        row.instructions.trim(),
        row.note.trim() ? `ملاحظة الطبيب: ${row.note.trim()}` : ""
      ].filter(Boolean).join(" | ");

      return {
        medicineId: inventoryItem?.id,
        medicineName: inventoryItem?.medicineName ?? row.medicineName.trim(),
        dosage: row.dosage.trim(),
        duration: row.duration.trim(),
        quantity: row.quantity,
        instructions: instructions || undefined
      };
    });
    const labRequests = doctorLabRows.map((row) => ({
      testId: Number(row.testId),
      reason: row.reason.trim() || undefined,
      clinicalNotes: row.clinicalNotes.trim() || undefined
    }));

    void submitDoctorPayload(visitId, {
      diagnosis: form.get("diagnosis"),
      symptoms: form.get("symptoms") || undefined,
      notes: form.get("notes") || undefined,
      prescriptions,
      labRequests
    }, prescriptions.length > 0 || labRequests.length > 0
      ? "تم حفظ تقييم الطبيب وإرسال الطلبات المحددة إلى الأقسام المختصة."
      : "تم حفظ تقييم الطبيب دون إنشاء طلب مختبر أو طلب صيدلية.");
  }

  function submitReportLink(event: FormEvent<HTMLFormElement>, visitId: number) {
    event.preventDefault();

    if (!reportLinkForm.title.trim() || !reportLinkForm.reportUrl.trim()) {
      setError("أدخل عنوان التقرير ورابط التقرير قبل الحفظ.");
      return;
    }

    try {
      const reportUrl = new URL(reportLinkForm.reportUrl.trim());
      if (!["http:", "https:"].includes(reportUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      setError("أدخل رابط تقرير صالح يبدأ بـ http أو https.");
      return;
    }

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/visit-workflow/${visitId}/report-link`, {
          method: "POST",
          body: JSON.stringify({
            title: reportLinkForm.title.trim(),
            category: reportLinkForm.category,
            reportUrl: reportLinkForm.reportUrl.trim(),
            shareWithPatient: true
          })
        }),
      "تم إرسال التقرير للمريض."
    ).then(() => {
      setReportLinkForm(defaultReportLinkForm);
    });
  }

  function publishLabResult(visitId: number, requestId: number) {
    const patientNotes = window.prompt("ملاحظة تظهر للمريض عند النشر (اختياري)") ?? "";

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/lab/requests/${requestId}/publish`, {
          method: "POST",
          body: JSON.stringify({
            patientNotes: patientNotes.trim() || undefined
          })
        }),
      "تم نشر تقرير المختبر للمريض."
    );
  }

  async function respondToPharmacyReview(
    visitId: number,
    prescription: NonNullable<WorkflowVisit["prescriptions"]>[number],
    decision: "APPROVE" | "UPDATE" | "CANCEL"
  ) {
    const response = window.prompt(
      decision === "APPROVE"
        ? "أدخل رد الطبيب بالموافقة:"
        : decision === "CANCEL"
          ? "أدخل سبب إلغاء الدواء:"
          : "أدخل توضيح التعديل:"
    )?.trim();
    if (!response) return;

    const payload: Record<string, unknown> = { decision, response };
    if (decision === "UPDATE") {
      const medicineName = window.prompt("اسم الدواء:", prescription.medicineName)?.trim();
      const dosage = window.prompt("الجرعة:", prescription.dosage)?.trim();
      const duration = window.prompt("المدة:", prescription.duration ?? "")?.trim();
      const quantity = Number(window.prompt("الكمية:", String(prescription.quantity)));
      const instructions = window.prompt("تعليمات الاستخدام:", prescription.instructions ?? "")?.trim();

      if (!medicineName || !dosage || !duration || !Number.isInteger(quantity) || quantity < 1) {
        setError("يجب إدخال اسم الدواء والجرعة والمدة والكمية بشكل صحيح.");
        return;
      }
      Object.assign(payload, { medicineName, dosage, duration, quantity, instructions });
    }

    await runAction(
      visitId,
      () =>
        apiRequest(`/center/pharmacy/prescriptions/${prescription.id}/doctor-review`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        }),
      decision === "CANCEL" ? "تم إلغاء الدواء وإبلاغ الصيدلية." : "تم إرسال رد الطبيب إلى الصيدلية."
    );
  }

  function approveLabResult(visitId: number, requestId: number) {
    const doctorNotes = window.prompt("ملاحظة اعتماد للطبيب (اختياري)") ?? "";

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/lab/requests/${requestId}/approve`, {
          method: "POST",
          body: JSON.stringify({
            doctorNotes: doctorNotes.trim() || undefined
          })
        }),
      "تم اعتماد نتيجة المختبر."
    );
  }

  function returnLabResultForCorrection(visitId: number, requestId: number) {
    const reason = window.prompt("سبب إرجاع النتيجة للتصحيح");
    if (!reason?.trim()) return;

    void runAction(
      visitId,
      () =>
        apiRequest(`/center/lab/requests/${requestId}/return-correction`, {
          method: "POST",
          body: JSON.stringify({
            reason: reason.trim()
          })
        }),
      "تم إرجاع نتيجة المختبر للتصحيح."
    );
  }

  function confirmPrescriptionOverride() {
    if (!pendingDoctorSubmission) {
      return;
    }

    if (hasHighSeverityWarning(prescriptionWarnings) && !overrideReason.trim()) {
      setError("High severity prescription warnings require an override reason.");
      return;
    }

    void submitDoctorPayload(pendingDoctorSubmission.visitId, {
      ...pendingDoctorSubmission.payload,
      overridePrescriptionWarnings: true,
      overrideReason: overrideReason.trim() || undefined
    });
  }

  return (
    <div className="page-stack">
      <header className="page-panel section-header">
        <div>
          <p className="eyebrow">رحلة المريض داخل المركز</p>
          <h1>ملفات الزيارات والمتابعة</h1>
          <p className="muted">تظهر الملفات كعناوين مختصرة، ويفتح المستخدم الملف الذي يحتاجه فقط حسب صلاحيات دوره.</p>
        </div>
        <label className="field">
          <span>حالة الملف</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}
      {message ? <div className="success-banner">{message}</div> : null}
      {prescriptionWarnings.length > 0 && pendingDoctorSubmission ? (
        <div className="warning-panel">
          <div>
            <p className="eyebrow">Prescription safety warning</p>
            <h3>Review before saving prescription</h3>
          </div>
          <div className="stack-list">
            {prescriptionWarnings.map((warning, index) => (
              <article key={`${warning.prescriptionIndex}-${warning.warningType}-${index}`} className="inline-note">
                <strong>{warning.severity}</strong> - {warning.medicineName}: {warning.message}
                {warning.conflictWith ? <span> ({warning.conflictWith})</span> : null}
              </article>
            ))}
          </div>
          <label className="field">
            <span>Override reason{hasHighSeverityWarning(prescriptionWarnings) ? " (required)" : ""}</span>
            <textarea
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="Explain why the prescription should still be saved."
            />
          </label>
          <div className="button-row">
            <button className="primary-button" disabled={busyId === pendingDoctorSubmission.visitId} onClick={confirmPrescriptionOverride} type="button">
              Confirm and save
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                setPrescriptionWarnings([]);
                setPendingDoctorSubmission(null);
                setOverrideReason("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {canIntake ? (
        <SectionCard title="تسجيل زيارة جديدة" subtitle="إدخال المريض إلى النظام من الحجز أو الإحالة أو الوصول المباشر للمركز">
          <form className="form-grid" onSubmit={submitVisit}>
            <label className="field">
              <span>المريض</span>
              <select name="patientId" required defaultValue="">
                <option value="" disabled>
                  اختر المريض
                </option>
                {intake.patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName} - {patient.phone}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>الطبيب</span>
              <select name="doctorId" defaultValue="">
                <option value="">يحدد لاحقًا</option>
                {intake.doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>تاريخ الزيارة</span>
              <input name="visitDate" type="date" required />
            </label>
            <label className="field">
              <span>الوقت</span>
              <input name="visitTime" type="time" />
            </label>
            <label className="field">
              <span>نوع الزيارة</span>
              <select name="visitType" defaultValue="CONSULTATION">
                <option value="CONSULTATION">استشارة</option>
                <option value="FOLLOW_UP">متابعة</option>
                <option value="EMERGENCY">طوارئ</option>
                <option value="LAB">مختبر</option>
              </select>
            </label>
            <label className="field">
              <span>الأولوية</span>
              <select name="priority" defaultValue="NORMAL">
                <option value="NORMAL">عادي</option>
                <option value="URGENT">عاجل</option>
                <option value="EMERGENCY">طارئ</option>
              </select>
            </label>
            <label className="field">
              <span>الأعراض الأولية</span>
              <textarea name="symptoms" />
            </label>
            <label className="field">
              <span>ملاحظات الاستقبال</span>
              <textarea name="notes" />
            </label>
            <button className="primary-button" disabled={busyId === 0} type="submit">
              تسجيل الزيارة
            </button>
          </form>
        </SectionCard>
      ) : null}

      {guidedMessage ? <div className="inline-note target-highlight">{guidedMessage}</div> : null}

      <SectionCard title="جدول ملفات الزيارة" subtitle="اضغط فتح الملف لعرض التفاصيل، ولن تظهر الملفات مفتوحة كلها في نفس الوقت.">
        {visits.length > 0 ? (
          <div className="table-shell">
            <table className="data-table visit-files-table">
              <thead>
                <tr>
                  <th>المريض</th>
                  <th>الطبيب</th>
                  <th>حالة الملف</th>
                  <th>الأولوية</th>
                  <th>الأقسام المرتبطة</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {visits.map((visit) => (
                  <tr key={visit.id} className={selectedVisitId === visit.id ? "is-selected" : undefined}>
                    <td>
                      <strong>{visit.patient.fullName}</strong>
                      <span>{visit.patient.phone}</span>
                    </td>
                    <td>{visit.doctor?.fullName ?? "لم يحدد بعد"}</td>
                    <td>
                      <span className={`status-badge ${statusClass(visit.workflowStatus)}`}>
                        {statusLabels[visit.workflowStatus] ?? visit.workflowStatus}
                      </span>
                      <span>{uploadLabels[visit.uploadStatus] ?? visit.uploadStatus}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${priorityClass(visit.priority)}`}>
                        {priorityLabels[visit.priority]}
                      </span>
                    </td>
                    <td>
                      تمريض: {visit.nursingAssessments?.length ?? 0} | أدوية: {visit.prescriptions?.length ?? 0} | مختبر:{" "}
                      {visit.labRequests?.length ?? 0}
                    </td>
                    <td>
                      <button
                        className={selectedVisitId === visit.id ? "primary-button" : "ghost-button"}
                        type="button"
                        onClick={() => setSelectedVisitId(visit.id)}
                      >
                        {selectedVisitId === visit.id ? "مفتوح" : "فتح الملف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state compact">لا توجد ملفات زيارة ضمن هذا التصنيف.</div>
        )}
      </SectionCard>

      {selectedVisit ? (
        <SectionCard
          title={`ملف زيارة ${selectedVisit.patient.fullName}`}
          subtitle={`رقم الملف ${selectedVisit.id} | ${statusLabels[selectedVisit.workflowStatus] ?? selectedVisit.workflowStatus}`}
          action={
            <button className="ghost-button" type="button" onClick={() => setSelectedVisitId(null)}>
              إغلاق الملف
            </button>
          }
        >
          {selectedVisit.uploadError ? <div className="error-banner">{selectedVisit.uploadError}</div> : null}

          <div className="visit-section-stack">
            {canViewReception ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>البيانات الأساسية والاستقبال</h3>
                    <p className="muted">هذا القسم يوضح مصدر الزيارة وتعيين الطبيب والبيانات الأولية.</p>
                  </div>
                </header>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>اسم المريض</span>
                    <strong>{selectedVisit.patient.fullName}</strong>
                  </div>
                  <div className="detail-field">
                    <span>هاتف المريض</span>
                    <strong>{selectedVisit.patient.phone}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الرقم الموحد</span>
                    <strong>{valueOrDash(selectedVisit.patient.unifiedId)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الطبيب المعين</span>
                    <strong>{selectedVisit.doctor?.fullName ?? "لم يحدد بعد"}</strong>
                  </div>
                  <div className="detail-field">
                    <span>نوع الزيارة</span>
                    <strong>{visitTypeLabels[selectedVisit.visitType ?? ""] ?? valueOrDash(selectedVisit.visitType)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>تاريخ الزيارة</span>
                    <strong>{formatDate(selectedVisit.visitDate)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>وقت الزيارة</span>
                    <strong>{valueOrDash(selectedVisit.visitTime)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الأعراض الأولية</span>
                    <strong>{valueOrDash(selectedVisit.symptoms)}</strong>
                  </div>
                  <div className="detail-field field-span-2">
                    <span>ملاحظات الاستقبال</span>
                    <strong>{valueOrDash(selectedVisit.notes)}</strong>
                  </div>
                </div>

                {canIntake && ["WAITING_RECEPTION", "WAITING_TRIAGE", "WAITING_DOCTOR"].includes(selectedVisit.workflowStatus) ? (
                  <form
                    className="form-grid visit-inline-form"
                    onSubmit={(event) => submitAssignDoctor(event, selectedVisit.id)}
                    key={`assign-${selectedVisit.id}-${selectedVisit.doctor?.id ?? "none"}`}
                  >
                    <label className="field">
                      <span>تعيين الطبيب</span>
                      <select name="doctorId" required defaultValue={selectedVisit.doctor?.id ? String(selectedVisit.doctor.id) : ""}>
                        <option value="" disabled>
                          اختر الطبيب
                        </option>
                        {intake.doctors.map((doctor) => (
                          <option key={doctor.id} value={doctor.id}>
                            {doctor.fullName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                      حفظ تعيين الطبيب
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            {canViewNursing ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم التمريض</h3>
                    <p className="muted">القياسات والملاحظات التمريضية تظهر للطبيب، ولا يستطيع الطبيب تعديلها.</p>
                  </div>
                </header>

                {(selectedVisit.nursingAssessments?.length ?? 0) > 0 ? (
                  <div className="table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>وقت التقييم</th>
                          <th>ضغط الدم</th>
                          <th>الحرارة</th>
                          <th>النبض</th>
                          <th>الأكسجين</th>
                          <th>السكر</th>
                          <th>ملاحظات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.nursingAssessments?.map((assessment) => (
                          <tr key={assessment.id}>
                            <td>{formatDateTime(assessment.assessedAt)}</td>
                            <td>{valueOrDash(assessment.bloodPressure)}</td>
                            <td>{valueOrDash(assessment.temperature)}</td>
                            <td>{valueOrDash(assessment.heartRate)}</td>
                            <td>{valueOrDash(assessment.oxygenSaturation)}</td>
                            <td>{valueOrDash(assessment.bloodGlucose)}</td>
                            <td>{valueOrDash(assessment.notes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد قياسات تمريضية مسجلة بعد.</div>
                )}

                {canEditNursing && selectedVisit.workflowStatus === "WAITING_TRIAGE" ? (
                  <form className="form-grid visit-inline-form" onSubmit={(event) => submitTriage(event, selectedVisit.id)}>
                    <label className="field">
                      <span>ضغط الدم</span>
                      <input name="bloodPressure" placeholder="120/80" />
                    </label>
                    <label className="field">
                      <span>الحرارة</span>
                      <input name="temperature" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>النبض</span>
                      <input name="heartRate" type="number" />
                    </label>
                    <label className="field">
                      <span>نسبة الأكسجين</span>
                      <input name="oxygenSaturation" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>الوزن</span>
                      <input name="weightKg" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>الطول</span>
                      <input name="heightCm" type="number" step="0.1" />
                    </label>
                    <label className="field">
                      <span>معدل التنفس</span>
                      <input name="respiratoryRate" type="number" />
                    </label>
                    <label className="field">
                      <span>سكر الدم</span>
                      <input name="bloodGlucose" type="number" step="0.1" />
                    </label>
                    <label className="field field-span-2">
                      <span>الملاحظات التمريضية</span>
                      <textarea name="notes" />
                    </label>
                    <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                      حفظ تقييم التمريض
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            {canViewDoctor ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم الطبيب</h3>
                    <p className="muted">التشخيص والخطة العلاجية وطلبات المختبر والصيدلية.</p>
                  </div>
                </header>
                <div className="detail-grid">
                  <div className="detail-field">
                    <span>التشخيص</span>
                    <strong>{valueOrDash(selectedVisit.diagnosis)}</strong>
                  </div>
                  <div className="detail-field">
                    <span>الأعراض بعد التقييم</span>
                    <strong>{valueOrDash(selectedVisit.symptoms)}</strong>
                  </div>
                  <div className="detail-field field-span-2">
                    <span>ملاحظات الطبيب</span>
                    <strong>{valueOrDash(selectedVisit.notes)}</strong>
                  </div>
                </div>

                {canAssess && ["WAITING_DOCTOR", "IN_TREATMENT"].includes(selectedVisit.workflowStatus) ? (
                  <form className="form-grid visit-inline-form doctor-assessment-form" onSubmit={(event) => submitDoctorAssessment(event, selectedVisit.id)}>
                    <section className="field-span-2 prescription-editor">
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">التقييم الطبي</p>
                          <h3>التقييم الطبي</h3>
                        </div>
                      </div>
                      <div className="form-grid">
                        <label className="field">
                          <span>التشخيص</span>
                          <input name="diagnosis" required minLength={3} list={`diseases-${selectedVisit.id}`} />
                          <datalist id={`diseases-${selectedVisit.id}`}>
                            {catalogs.diseases.map((disease) => (
                              <option key={disease.id} value={disease.name} />
                            ))}
                          </datalist>
                        </label>
                        <label className="field">
                          <span>الأعراض</span>
                          <textarea name="symptoms" />
                        </label>
                        <label className="field field-span-2">
                          <span>ملاحظات الطبيب</span>
                          <textarea name="notes" />
                        </label>
                      </div>
                    </section>

                    <section id="doctor-lab-section" className={`field-span-2 prescription-editor${guidedFocus === "lab" ? " target-highlight" : ""}`}>
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">اختياري</p>
                          <h3>طلبات المختبر — اختياري</h3>
                          <p className="muted">يمكن حفظ الزيارة دون طلب مختبر. لا يتم إرسال شيء للمختبر إلا إذا أضاف الطبيب فحصًا واحدًا على الأقل.</p>
                        </div>
                        <button
                          className="ghost-button"
                          id="add-lab-request-button"
                          onClick={() => setDoctorLabRows((current) => [...current, createLabRequestDraft()])}
                          type="button"
                        >
                          + طلب فحص مختبر
                        </button>
                      </div>
                      <div className="stack-list compact">
                        {doctorLabRows.map((row, index) => (
                          <article className="prescription-draft-row" key={row.key}>
                            <div className="section-header">
                              <strong>فحص المختبر {index + 1}</strong>
                              <button
                                className="danger-button"
                                onClick={() => setDoctorLabRows((current) => current.filter((item) => item.key !== row.key))}
                                type="button"
                              >
                                إزالة
                              </button>
                            </div>
                            <div className="form-grid">
                              <label className="field">
                                <span>الفحص</span>
                                <select
                                  value={row.testId}
                                  onChange={(event) => setDoctorLabRows((current) => current.map((item) => item.key === row.key ? { ...item, testId: event.target.value ? Number(event.target.value) : "" } : item))}
                                >
                                  <option value="">اختر الفحص</option>
                                  {catalogs.labTests.map((test) => (
                                    <option key={test.id} value={test.id}>
                                      {test.testName} - {test.category}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field">
                                <span>سبب/ملاحظة اختيارية</span>
                                <input value={row.reason} onChange={(event) => setDoctorLabRows((current) => current.map((item) => item.key === row.key ? { ...item, reason: event.target.value } : item))} />
                              </label>
                              <label className="field field-span-2">
                                <span>ملاحظات للمختبر</span>
                                <textarea value={row.clinicalNotes} onChange={(event) => setDoctorLabRows((current) => current.map((item) => item.key === row.key ? { ...item, clinicalNotes: event.target.value } : item))} />
                              </label>
                            </div>
                          </article>
                        ))}
                        {doctorLabRows.length === 0 ? (
                          <div className="empty-state compact">لم تتم إضافة فحوص. ستُحفظ الزيارة دون طلب مختبر.</div>
                        ) : null}
                      </div>
                    </section>

                    <section id="doctor-prescription-section" className={`field-span-2 prescription-editor${guidedFocus === "prescription" ? " target-highlight" : ""}`}>
                      <div className="section-header">
                        <div>
                          <p className="eyebrow">اختياري</p>
                          <h3>الوصفة الدوائية — اختياري</h3>
                          <p className="muted">يمكن حفظ الزيارة بدون وصفة. لا يتم إرسال شيء للصيدلية إلا إذا أضاف الطبيب دواءً واحدًا على الأقل.</p>
                        </div>
                        <button
                          className="ghost-button"
                          id="add-prescription-button"
                          onClick={() => setDoctorPrescriptionRows((current) => [...current, createPrescriptionDraft()])}
                          type="button"
                        >
                          + إضافة دواء للوصفة
                        </button>
                      </div>
                      <div className="stack-list compact">
                        {doctorPrescriptionRows.map((row, index) => {
                          const linkedMedicine =
                            (row.medicineId
                              ? catalogs.medicines.find((medicine) => medicine.id === row.medicineId)
                              : undefined) ??
                            catalogs.medicines.find(
                              (medicine) => medicine.medicineName.trim().toLowerCase() === row.medicineName.trim().toLowerCase()
                            );
                          return (
                            <article className="prescription-draft-row" key={row.key}>
                              <div className="section-header">
                                <strong>الدواء {index + 1}</strong>
                                <button
                                  className="danger-button"
                                  onClick={() => setDoctorPrescriptionRows((current) => current.filter((item) => item.key !== row.key))}
                                  type="button"
                                >
                                  إزالة
                                </button>
                              </div>
                              <div className="form-grid">
                                <label className="field">
                                  <span>اختيار من المخزون</span>
                                  <select
                                    value={row.medicineId ?? ""}
                                    onChange={(event) => {
                                      const medicine = catalogs.medicines.find((item) => item.id === Number(event.target.value));
                                      setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, medicineId: medicine?.id, medicineName: medicine?.medicineName ?? "" } : item));
                                    }}
                                  >
                                    <option value="">اكتب اسم الدواء يدويًا أو اختر من المخزون</option>
                                    {catalogs.medicines.map((medicine) => (
                                      <option key={medicine.id} value={medicine.id}>
                                        {medicine.medicineName} - المتاح {medicine.quantity} {medicine.unit}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>اسم الدواء</span>
                                  <input
                                    placeholder="ابحث بالعربية أو الإنجليزية"
                                    value={row.medicineName}
                                    onChange={(event) => {
                                      const nextName = event.target.value;
                                      const matchedMedicine = catalogs.medicines.find(
                                        (medicine) => medicine.medicineName.trim().toLowerCase() === nextName.trim().toLowerCase()
                                      );
                                      setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, medicineId: matchedMedicine?.id, medicineName: nextName } : item));
                                    }}
                                  />
                                </label>
                                <label className="field">
                                  <span>الجرعة</span>
                                  <input value={row.dosage} onChange={(event) => setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, dosage: event.target.value } : item))} />
                                </label>
                                <label className="field">
                                  <span>الكمية</span>
                                  <input min="1" type="number" value={row.quantity} onChange={(event) => setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, quantity: Number(event.target.value) } : item))} />
                                </label>
                                <label className="field">
                                  <span>المدة العلاجية</span>
                                  <input value={row.duration} onChange={(event) => setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, duration: event.target.value } : item))} />
                                </label>
                                <label className="field">
                                  <span>تعليمات الاستخدام</span>
                                  <input value={row.instructions} onChange={(event) => setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, instructions: event.target.value } : item))} />
                                </label>
                                <label className="field">
                                  <span>ملاحظة اختيارية</span>
                                  <input value={row.note} onChange={(event) => setDoctorPrescriptionRows((current) => current.map((item) => item.key === row.key ? { ...item, note: event.target.value } : item))} />
                                </label>
                              </div>
                              {row.medicineName && !linkedMedicine ? (
                                <div className="inline-note">
                                  هذا الدواء غير مرتبط بالمخزون، ولن يتم خصم الكمية تلقائيًا.
                                </div>
                              ) : linkedMedicine ? (
                                <div className="inline-note">
                                  مرتبط بالمخزون: المتاح {linkedMedicine.quantity} {linkedMedicine.unit}.
                                </div>
                              ) : null}
                            </article>
                          );
                        })}
                        {doctorPrescriptionRows.length === 0 ? (
                          <div className="empty-state compact">لم تتم إضافة أدوية. ستُحفظ الزيارة دون طلب صيدلية.</div>
                        ) : null}
                      </div>
                    </section>

                    <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                      حفظ تقييم الطبيب
                    </button>
                  </form>
                ) : null}
              </article>
            ) : null}

            <article className="visit-file-section">
              <header className="section-header">
                <div>
                  <h3>روابط التقارير الطبية</h3>
                  <p className="muted">بعد حفظ تقييم الطبيب، أضف رابط التقرير الخارجي ليظهر للمريض ويفتح في صفحة جديدة.</p>
                </div>
              </header>
              {!canAddReportLink && canAssess ? (
                <div className="inline-note">احفظ تقييم الطبيب أولاً، ثم أضف رابط التقرير الخارجي للمريض.</div>
              ) : null}
              <form onSubmit={(event) => submitReportLink(event, selectedVisit.id)}>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>رقم المريض</th>
                        <th>اسم المريض</th>
                        <th>اسم الطبيب</th>
                        <th>اسم القسم</th>
                        <th>تاريخ الطلب</th>
                        <th>نوع التقرير</th>
                        <th>رابط التقرير</th>
                        <th>الإجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {canAssess && canAddReportLink ? (
                        <tr>
                          <td>{patientNumber(selectedVisit)}</td>
                          <td>{selectedVisit.patient.fullName}</td>
                          <td>{selectedVisit.doctor?.fullName ?? user?.fullName ?? "الطبيب الحالي"}</td>
                          <td>{reportCategoryLabel(reportLinkForm.category)}</td>
                          <td>{formatDateTime(selectedVisit.visitDate)}</td>
                          <td>
                            <select
                              value={reportLinkForm.category}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, category: event.target.value }))
                              }
                            >
                              {reportCategoryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={reportLinkForm.title}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, title: event.target.value }))
                              }
                              placeholder="عنوان التقرير"
                              required
                            />
                          </td>
                          <td>
                            <input
                              dir="ltr"
                              type="url"
                              value={reportLinkForm.reportUrl}
                              onChange={(event) =>
                                setReportLinkForm((current) => ({ ...current, reportUrl: event.target.value }))
                              }
                              placeholder="https://example.com/report.pdf"
                              required
                            />
                          </td>
                          <td>
                            <button className="primary-button" disabled={busyId === selectedVisit.id} type="submit">
                              حفظ الرابط
                            </button>
                          </td>
                        </tr>
                      ) : null}
                      {selectedVisit.resultReports?.map((report) => (
                        <tr key={report.id}>
                          <td>{patientNumber(selectedVisit)}</td>
                          <td>{selectedVisit.patient.fullName}</td>
                          <td>{report.author.fullName}</td>
                          <td>{reportDepartment(report)}</td>
                          <td>{formatDateTime(report.createdAt)}</td>
                          <td>{report.title}</td>
                          <td>
                            {report.reportUrl ? (
                              <a href={report.reportUrl} rel="noreferrer" target="_blank">
                                فتح التقرير
                              </a>
                            ) : (
                              "لا يوجد رابط"
                            )}
                          </td>
                          <td>{report.shareWithPatient ? "ظاهر للمريض" : "داخلي"}</td>
                        </tr>
                      ))}
                      {(selectedVisit.resultReports?.length ?? 0) === 0 && (!canAssess || !canAddReportLink) ? (
                        <tr>
                          <td colSpan={8}>لا توجد روابط تقارير محفوظة لهذا الملف.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </form>
            </article>

            {canViewLab ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم المختبر</h3>
                    <p className="muted">الطبيب يرى الطلبات والنتائج فقط، أما إدخال النتيجة فيتم من موظف المختبر.</p>
                  </div>
                </header>
                {(selectedVisit.labRequests?.length ?? 0) > 0 ? (
                  <div className="table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>الفحص</th>
                          <th>الحالة</th>
                          <th>النتيجة والتقرير</th>
                          <th>ملاحظات المراجعة</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.labRequests?.map((request) => {
                          const highlighted = searchParams.get("highlight") === `lab-result-${request.id}`;
                          const details = labRequestDetails(request);
                          const canPublish = canAssess && canPublishLabRequest(request);
                          const canReturnForCorrection = canAssess && canReturnLabRequestForCorrection(request);
                          const canApprove = canAssess && request.status === "SENT_TO_DOCTOR";
                          const hasVisibleAction =
                            canEditLab || canApprove || canPublish || canReturnForCorrection || Boolean(request.publishedToPatientAt);

                          return (
                            <tr key={request.id} id={`lab-result-${request.id}`} className={highlighted ? "target-highlight" : undefined}>
                              <td>
                                <strong>{request.test.testName}</strong>
                                <span>{valueOrDash(request.test.category)}</span>
                                {request.resultFileName ? <span>{request.resultFileName}</span> : null}
                              </td>
                              <td>
                                <strong>{labStatusLabel(request.status)}</strong>
                                <span>{labRequestMeta(request)}</span>
                              </td>
                              <td>
                                <strong>{labResultSummary(request)}</strong>
                                {request.abnormalFlag && request.abnormalFlag !== "NORMAL" ? (
                                  <StatusBadge status={request.abnormalFlag} />
                                ) : null}
                                <div className="button-row">
                                  {request.reportUrl ? (
                                    <a className="ghost-button" href={request.reportUrl} rel="noreferrer" target="_blank">
                                      فتح التقرير
                                    </a>
                                  ) : null}
                                  {request.imageUrl ? (
                                    <a className="ghost-button" href={request.imageUrl} rel="noreferrer" target="_blank">
                                      فتح الصورة
                                    </a>
                                  ) : null}
                                  {request.resultReport?.reportUrl ? (
                                    <a className="ghost-button" href={request.resultReport.reportUrl} rel="noreferrer" target="_blank">
                                      التقرير المنشور
                                    </a>
                                  ) : null}
                                </div>
                              </td>
                              <td>{details ? <span>{details}</span> : <span className="muted">لا توجد ملاحظات إضافية.</span>}</td>
                              <td>
                                <div className="button-row">
                                  {canEditLab ? (
                                    <Link className="ghost-button" to={`/lab?highlight=lab-request-${request.id}`}>
                                      فتح في المختبر
                                    </Link>
                                  ) : null}
                                  {canPublish ? (
                                    <button
                                      className="primary-button"
                                      disabled={busyId === selectedVisit.id}
                                      type="button"
                                      onClick={() => publishLabResult(selectedVisit.id, request.id)}
                                    >
                                      نشر للمريض
                                    </button>
                                  ) : null}
                                  {canApprove ? (
                                    <button
                                      className="primary-button"
                                      disabled={busyId === selectedVisit.id}
                                      type="button"
                                      onClick={() => approveLabResult(selectedVisit.id, request.id)}
                                    >
                                      اعتماد النتيجة
                                    </button>
                                  ) : null}
                                  {canReturnForCorrection ? (
                                    <button
                                      className="ghost-button"
                                      disabled={busyId === selectedVisit.id}
                                      type="button"
                                      onClick={() => returnLabResultForCorrection(selectedVisit.id, request.id)}
                                    >
                                      إرجاع للتصحيح
                                    </button>
                                  ) : null}
                                  {request.publishedToPatientAt ? <span className="tag">ظاهر للمريض</span> : null}
                                  {!canEditLab && !canAssess ? <span className="muted">قراءة فقط</span> : null}
                                  {!hasVisibleAction && canAssess ? <span className="muted">بانتظار إرسال المختبر</span> : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد فحوص مطلوبة لهذه الزيارة.</div>
                )}
              </article>
            ) : null}

            {canViewPharmacy ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>قسم الصيدلية</h3>
                    <p className="muted">الطبيب يرى حالة الصرف، والصيدلي يؤكد تسليم الأدوية المطلوبة.</p>
                  </div>
                </header>
                {(selectedVisit.prescriptions?.length ?? 0) > 0 ? (
                  <div className="table-shell">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>الدواء</th>
                          <th>الجرعة</th>
                          <th>المدة</th>
                          <th>الكمية</th>
                          <th>تعليمات الاستخدام</th>
                          <th>حالة الصرف</th>
                          <th>الإجراء</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVisit.prescriptions?.map((prescription) => (
                          <tr
                            className={searchParams.get("highlight") === `prescription-${prescription.id}` ? "target-highlight" : undefined}
                            id={`prescription-${prescription.id}`}
                            key={prescription.id}
                          >
                            <td>{prescription.medicineName}</td>
                            <td>{prescription.dosage}</td>
                            <td>{valueOrDash(prescription.duration)}</td>
                            <td>{prescription.quantity}</td>
                            <td>{valueOrDash(prescription.instructions)}</td>
                            <td>
                              <strong>{pharmacyStatusLabels[prescription.pharmacyStatus ?? (prescription.dispensed ? "DISPENSED" : "NEW")] ?? "قيد المتابعة"}</strong>
                              {prescription.doctorReviewReason ? <span>{prescription.doctorReviewReason}</span> : null}
                            </td>
                            <td>
                              {role === "DOCTOR" && prescription.pharmacyStatus === "NEEDS_DOCTOR_REVIEW" ? (
                                <div className="table-actions">
                                  <button className="primary-button" disabled={busyId === selectedVisit.id} onClick={() => void respondToPharmacyReview(selectedVisit.id, prescription, "APPROVE")} type="button">
                                    اعتماد
                                  </button>
                                  <button className="ghost-button" disabled={busyId === selectedVisit.id} onClick={() => void respondToPharmacyReview(selectedVisit.id, prescription, "UPDATE")} type="button">
                                    تعديل الوصفة
                                  </button>
                                  <button className="danger-button" disabled={busyId === selectedVisit.id} onClick={() => void respondToPharmacyReview(selectedVisit.id, prescription, "CANCEL")} type="button">
                                    إلغاء الدواء
                                  </button>
                                </div>
                              ) : (
                                <span className="muted">قراءة فقط</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state compact">لا توجد وصفات دوائية لهذه الزيارة.</div>
                )}
              </article>
            ) : null}

            {canViewReception && selectedVisit.workflowTasks?.length ? (
              <article className="visit-file-section">
                <header className="section-header">
                  <div>
                    <h3>مسار المهام</h3>
                    <p className="muted">ملخص سريع للمراحل التي مر بها ملف الزيارة داخل المركز.</p>
                  </div>
                </header>
                <div className="table-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>المهمة</th>
                        <th>الدور</th>
                        <th>الحالة</th>
                        <th>النتيجة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVisit.workflowTasks.map((task) => (
                        <tr key={task.id}>
                          <td>{taskLabels[task.taskType] ?? task.taskType}</td>
                          <td>{valueOrDash(task.assignedRole)}</td>
                          <td>{task.status === "COMPLETED" ? "مكتملة" : "قيد الانتظار"}</td>
                          <td>{valueOrDash(task.resultSummary ?? task.instructions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ) : null}

            {canAssess ? (
              <div className="visit-detail-actions">
                {selectedVisit.workflowStatus === "READY_TO_UPLOAD" && selectedVisit.uploadStatus === "NOT_READY" ? (
                  <button
                    className="primary-button"
                    disabled={busyId === selectedVisit.id}
                    type="button"
                    onClick={() =>
                      void runAction(
                        selectedVisit.id,
                        () => apiRequest(`/center/visit-workflow/${selectedVisit.id}/complete`, { method: "POST" }),
                        "تم إنشاء الفاتورة وتجهيز الملف للرفع."
                      )
                    }
                  >
                    إنشاء الفاتورة وتجهيز الملف
                  </button>
                ) : null}

                {["READY", "FAILED"].includes(selectedVisit.uploadStatus) ? (
                  <button
                    className="primary-button"
                    disabled={busyId === selectedVisit.id}
                    type="button"
                    onClick={() =>
                      void runAction(
                        selectedVisit.id,
                        () => apiRequest(`/center/visit-workflow/${selectedVisit.id}/upload`, { method: "POST" }),
                        "تم رفع الزيارة إلى النظام المركزي."
                      )
                    }
                  >
                    {selectedVisit.uploadStatus === "FAILED" ? "إعادة محاولة الرفع" : "رفع إلى النظام المركزي"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : visits.length > 0 ? (
        <div className="empty-state">اختر ملف زيارة من الجدول لعرض تفاصيله.</div>
      ) : null}
    </div>
  );
}

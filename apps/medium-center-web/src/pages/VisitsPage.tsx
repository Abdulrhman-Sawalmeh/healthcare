import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

import { ApiError, apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import {
  CenterWorkspaceData,
  LocalPatientRecord,
  LocalVisitReportAttachment,
  LocalVisitReportRecord,
  PrescriptionSafetyWarningRecord,
  VisitRecord
} from "../types";

const defaultVisitForm = {
  patientId: "",
  doctorId: "",
  visitDate: "",
  visitTime: "",
  visitType: "CONSULTATION",
  symptoms: "",
  bloodPressure: "",
  temperature: "",
  heartRate: "",
  diagnosis: "",
  notes: "",
  prescriptionMedicine: "",
  prescriptionDosage: "",
  prescriptionDuration: "",
  prescriptionInstructions: ""
};

const defaultReportForm = {
  title: "",
  category: "GENERAL",
  reportUrl: "",
  summary: "",
  findings: "",
  recommendations: "",
  recommendedFollowUp: "",
  shareWithPatient: true,
  attachment: null as LocalVisitReportAttachment | null
};

const reportCategoryOptions = [
  { value: "GENERAL", label: "تقرير سريري عام" },
  { value: "LAB", label: "تحاليل مخبرية" },
  { value: "IMAGING", label: "تصوير طبي" },
  { value: "RADIOLOGY", label: "أشعة وتشخيص تصويري" },
  { value: "PATHOLOGY", label: "أنسجة وخزعات" },
  { value: "CARDIOLOGY", label: "قلب وتخطيط" },
  { value: "MICROBIOLOGY", label: "زراعة وميكروبيولوجي" },
  { value: "PROCEDURE", label: "إجراء طبي" },
  { value: "FOLLOW_UP", label: "خطة متابعة" },
  { value: "DISCHARGE", label: "خلاصة خروج" }
];

const reportTemplates = [
  { category: "GENERAL", label: "ملخص زيارة شامل" },
  { category: "LAB", label: "تحاليل عامة" },
  { category: "RADIOLOGY", label: "تقرير أشعة" },
  { category: "IMAGING", label: "صور طبية" },
  { category: "CARDIOLOGY", label: "تخطيط قلب" },
  { category: "MICROBIOLOGY", label: "زراعة مخبرية" },
  { category: "PATHOLOGY", label: "خزعة/أنسجة" },
  { category: "PROCEDURE", label: "إجراء طبي" },
  { category: "DISCHARGE", label: "خلاصة خروج" }
];

function ensureVisitReports(visit: VisitRecord) {
  return Array.isArray(visit.reports) ? visit.reports : [];
}

function getReportCategoryLabel(category: string) {
  return reportCategoryOptions.find((option) => option.value === category)?.label ?? toArabicLabel(category);
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

function buildStructuredReportDraft(visit: VisitRecord, category: string) {
  const visitMeta = [
    `المريض: ${visit.patientName}`,
    `رقم الملف الموحد: ${visit.patientUnifiedId ?? "غير مسجل"}`,
    `تاريخ الزيارة: ${formatDateTime(visit.visitDate)}`,
    `الطبيب: ${visit.doctorName}`,
    `التشخيص/سبب الزيارة: ${visit.diagnosis}`
  ].join("\n");

  const vitals = [
    `ضغط الدم: ${visit.bloodPressure ?? "غير موثق"}`,
    `الحرارة: ${visit.temperature ?? "غير موثقة"}`,
    `النبض: ${visit.heartRate ?? "غير موثق"}`,
    `الأعراض: ${visit.symptoms ?? "غير موثقة"}`
  ].join("\n");

  const commonFollowUp = "مراجعة الطبيب المعالج حسب الخطة أو فوراً عند ظهور ألم شديد، ضيق نفس، نزيف، حمى مستمرة، أو تدهور مفاجئ.";

  const templates: Record<string, { title: string; summary: string; findings: string; recommendations: string; followUp: string }> = {
    GENERAL: {
      title: `تقرير سريري شامل - ${visit.patientName}`,
      summary: `${visitMeta}\n\nملخص الحالة:\nتمت مراجعة المريض وتوثيق الحالة ضمن هذه الزيارة. ${visit.notes ?? "لا توجد ملاحظات إضافية."}`,
      findings: `العلامات الحيوية:\n${vitals}\n\nالفحص السريري:\n- المظهر العام:\n- القلب والدورة الدموية:\n- الجهاز التنفسي:\n- البطن:\n- الجهاز العصبي/الحركي:\n\nالنتائج المرتبطة:\n- الوصفات المسجلة: ${visit.prescriptions.length}`,
      recommendations: "الخطة العلاجية:\n- الالتزام بالأدوية والتعليمات الموصوفة.\n- مراقبة الأعراض وتوثيق أي تغير.\n- استكمال أي فحوصات مطلوبة قبل الزيارة القادمة.",
      followUp: commonFollowUp
    },
    LAB: {
      title: `تقرير تحاليل مخبرية شامل - ${visit.patientName}`,
      summary: `${visitMeta}\n\nنوع التقرير: تحاليل مخبرية عامة أو متخصصة. يتم تفسير النتائج مع الحالة السريرية وليس كأرقام منفصلة.`,
      findings: `بيانات العينة:\n- نوع العينة: دم / بول / مسحة / أخرى\n- تاريخ ووقت السحب:\n- حالة العينة: مقبولة / تحتاج إعادة\n\nجدول النتائج:\nالفحص | النتيجة | الوحدة | المجال المرجعي | التفسير\nCBC/WBC |  |  |  | \nHb |  | g/dL |  | \nPlatelets |  | 10^3/uL |  | \nGlucose |  | mg/dL |  | \nCreatinine |  | mg/dL |  | \nALT/AST |  | U/L |  | \nCRP/ESR |  |  |  | \n\nالقيم الحرجة أو غير الطبيعية:\n-\n\nملاحظات المختبر:\n-`,
      recommendations: "تفسير الطبيب:\n- ربط النتائج بالأعراض والفحص السريري.\n- إعادة الفحص عند وجود عينة غير مناسبة أو نتيجة غير متوقعة.\n- طلب فحوصات إضافية عند الحاجة.",
      followUp: "مراجعة النتائج خلال 3 إلى 7 أيام، أو فوراً إذا وُجدت قيمة حرجة أو تدهور سريري."
    },
    RADIOLOGY: {
      title: `تقرير أشعة وتشخيص تصويري - ${visit.patientName}`,
      summary: `${visitMeta}\n\nنوع الدراسة: X-Ray / CT / MRI / Ultrasound. التقرير يشمل سبب الطلب، التقنية، الوصف، والانطباع النهائي.`,
      findings: `سبب الفحص:\n-\n\nنوع الصورة/الدراسة:\n-\n\nالتقنية:\n- الجهة المصورة:\n- مادة التباين: بدون / مع تباين\n- جودة الصورة: مناسبة / محدودة\n\nالوصف:\n- العظام/الأنسجة:\n- الأعضاء/المناطق المصورة:\n- السوائل/الكتل/الالتهاب:\n- مقارنة بفحص سابق: لا يوجد / يوجد بتاريخ\n\nالانطباع التشخيصي:\n1.\n2.\n\nالمرفقات:\n- أرفق صورة الأشعة أو ملف PDF إن وجد.`,
      recommendations: "توصية الأشعة:\n- المتابعة السريرية مع الطبيب.\n- إعادة التصوير أو طلب CT/MRI/Ultrasound عند الحاجة.\n- الإحالة العاجلة إذا وُجدت علامة خطورة.",
      followUp: commonFollowUp
    },
    IMAGING: {
      title: `تقرير صور طبية ومرفقات - ${visit.patientName}`,
      summary: `${visitMeta}\n\nهذا التقرير مخصص للصور الطبية أو الملفات المرئية المرفقة مثل صور الجروح، الجلدية، المنظار، أو صور المتابعة.`,
      findings: `نوع الصورة:\n- صورة جلدية / جرح / منظار / موجات فوق صوتية / أخرى\n\nجودة الصورة:\n- واضحة / محدودة\n\nالوصف:\n- الموقع التشريحي:\n- الحجم/القياس التقريبي:\n- اللون/الحدود/الإفرازات/التغيرات:\n- مقارنة بصورة سابقة:\n\nالانطباع:\n-\n\nالمرفقات:\n- أرفق الصور الأصلية أو تقرير PDF.`,
      recommendations: "توصيات:\n- متابعة التغير بالصور عند الحاجة.\n- مراجعة تخصصية إذا زادت الأعراض أو ظهرت علامات التهاب/نزف.",
      followUp: commonFollowUp
    },
    CARDIOLOGY: {
      title: `تقرير قلب وتخطيط ECG - ${visit.patientName}`,
      summary: `${visitMeta}\n\nيشمل التقرير قراءة تخطيط القلب أو فحوصات القلب المرتبطة بالزيارة.`,
      findings: `بيانات الفحص:\n- نوع الفحص: ECG / Echo / Troponin / Holter\n- سرعة القلب:\n- النظم: منتظم / غير منتظم\n- المحور:\n- PR/QRS/QT:\n- تغيرات ST-T:\n- علامات تضخم/نقص تروية:\n\nالنتيجة/الانطباع:\n-\n\nمقارنة بفحص سابق:\n-`,
      recommendations: "توصيات قلبية:\n- ربط النتيجة بالأعراض والعلامات الحيوية.\n- مراجعة طوارئ عند ألم صدري شديد، ضيق نفس، إغماء، أو خفقان مستمر.\n- طلب إنزيمات قلب/إيكو/تحويل اختصاصي عند الحاجة.",
      followUp: "متابعة قلبية حسب شدة النتيجة، وفوراً عند أعراض إنذارية."
    },
    MICROBIOLOGY: {
      title: `تقرير زراعة وميكروبيولوجي - ${visit.patientName}`,
      summary: `${visitMeta}\n\nيشمل الزراعة، الحساسية للمضادات، ونتائج العدوى المحتملة.`,
      findings: `نوع العينة:\n- بول / دم / بلغم / مسحة / جرح / أخرى\n\nالفحص المطلوب:\n- Culture / Gram stain / PCR / Antigen\n\nالنتيجة:\n- النمو الجرثومي:\n- عدد المستعمرات/الحمل:\n- الحساسية للمضادات:\nمضاد | حساس/متوسط/مقاوم | ملاحظات\n\nالتلوث المحتمل/جودة العينة:\n-`,
      recommendations: "توصيات علاجية:\n- اختيار المضاد حسب الحساسية والحالة السريرية.\n- تعديل العلاج إذا ظهرت مقاومة.\n- إعادة العينة عند الاشتباه بتلوث أو عدم توافق النتيجة مع الحالة.",
      followUp: "مراجعة خلال 48 إلى 72 ساعة أو عند ظهور حرارة مستمرة/تدهور."
    },
    PATHOLOGY: {
      title: `تقرير أنسجة وخزعة - ${visit.patientName}`,
      summary: `${visitMeta}\n\nيشمل وصف العينة النسيجية، التشخيص، والهوامش/الدرجات عند توفرها.`,
      findings: `بيانات العينة:\n- الموقع التشريحي:\n- طريقة السحب: خزعة / استئصال / مسحة\n- حجم العينة:\n\nالوصف العياني:\n-\n\nالوصف المجهري:\n-\n\nالتشخيص النسيجي:\n-\n\nالهوامش/الدرجة/المرحلة إن وجدت:\n-\n\nفحوصات إضافية:\n- IHC / Molecular / Special stains`,
      recommendations: "توصيات:\n- ربط النتيجة بالخطة الجراحية/الاختصاصية.\n- عرض النتيجة على الاختصاص المناسب عند الاشتباه بورم أو تغير عالي الخطورة.",
      followUp: "متابعة اختصاصية حسب نتيجة الخزعة وخطة العلاج."
    },
    PROCEDURE: {
      title: `تقرير إجراء طبي - ${visit.patientName}`,
      summary: `${visitMeta}\n\nيوثق التقرير الإجراء الذي تم، الاستطباب، الخطوات، والنتيجة الفورية.`,
      findings: `اسم الإجراء:\n-\n\nالاستطباب:\n-\n\nالموافقة والتحضير:\n-\n\nالخطوات:\n1.\n2.\n3.\n\nالنتيجة الفورية:\n-\n\nالمضاعفات:\n- لا يوجد / يوجد\n\nالمرفقات أو الصور:\n-`,
      recommendations: "تعليمات ما بعد الإجراء:\n- العناية بالمنطقة/الجرح.\n- الأدوية والتعليمات.\n- علامات الخطر التي تستدعي مراجعة فورية.",
      followUp: "موعد متابعة حسب نوع الإجراء أو خلال 7 إلى 14 يومًا."
    },
    DISCHARGE: {
      title: `خلاصة خروج/انتهاء زيارة - ${visit.patientName}`,
      summary: `${visitMeta}\n\nخلاصة الحالة عند انتهاء الزيارة أو الخروج، تشمل التشخيص النهائي والخطة.`,
      findings: `التشخيص النهائي:\n${visit.diagnosis}\n\nمسار الحالة أثناء الزيارة:\n-\n\nالفحوصات المنجزة:\n-\n\nالأدوية عند الخروج:\n${visit.prescriptions.map((item) => `- ${item.medicineName}: ${item.dosage} لمدة ${item.duration}`).join("\n") || "- لا توجد أدوية مسجلة"}\n\nحالة المريض عند الخروج:\n- مستقر / يحتاج متابعة / يحتاج تحويل`,
      recommendations: "تعليمات الخروج:\n- الالتزام بالأدوية.\n- الراحة والسوائل/النظام الغذائي حسب الحالة.\n- مراجعة الطوارئ عند علامات الخطر.",
      followUp: commonFollowUp
    }
  };

  const template = templates[category] ?? templates.GENERAL;

  return {
    title: template.title,
    category,
    summary: template.summary,
    findings: template.findings,
    recommendations: template.recommendations,
    recommendedFollowUp: template.followUp,
    shareWithPatient: true,
    reportUrl: "",
    attachment: null as LocalVisitReportAttachment | null
  };
}

function buildSmartReportDraft(visit: VisitRecord) {
  const visitFocusMap: Record<string, { category: string; titleSuffix: string; followUp: string }> = {
    LAB: {
      category: "LAB",
      titleSuffix: "نتائج مخبرية",
      followUp: "مراجعة خلال 3 إلى 7 أيام بعد صدور النتائج النهائية."
    },
    FOLLOW_UP: {
      category: "FOLLOW_UP",
      titleSuffix: "خطة متابعة",
      followUp: "متابعة حسب استجابة الحالة والخطة العلاجية خلال أسبوعين."
    },
    EMERGENCY: {
      category: "DISCHARGE",
      titleSuffix: "خلاصة حالة عاجلة",
      followUp: "المراجعة فورًا عند تكرر الأعراض أو ازدياد شدتها."
    }
  };

  const focus = visitFocusMap[visit.visitType] ?? {
    category: "GENERAL",
    titleSuffix: "ملخص سريري",
    followUp: "متابعة روتينية حسب تقييم الطبيب المعالج."
  };

  return {
    title: `${focus.titleSuffix} - ${visit.patientName}`,
    category: focus.category,
    summary: `تمت مراجعة حالة ${visit.patientName} بخصوص ${visit.diagnosis}. ${visit.notes ?? "الحالة موثقة ضمن سجل الزيارة الحالي."}`,
    findings:
      visit.symptoms ||
      `المؤشرات الحيوية المسجلة: الضغط ${visit.bloodPressure ?? "غير موثق"}، الحرارة ${visit.temperature ?? "-"}، النبض ${visit.heartRate ?? "-"}.`,
    recommendations:
      visit.prescriptions.length > 0
        ? `الالتزام بالخطة الدوائية الحالية وعدد الوصفات المسجلة (${visit.prescriptions.length}).`
        : "الالتزام بالتوصيات السريرية والعودة عند حدوث أي تغير مهم.",
    recommendedFollowUp: focus.followUp,
    shareWithPatient: true,
    reportUrl: "",
    attachment: null as LocalVisitReportAttachment | null
  };
}

async function readFileAsBase64(file: File) {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
}

export function VisitsPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [patients, setPatients] = useState<LocalPatientRecord[]>([]);
  const [workspace, setWorkspace] = useState<CenterWorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingVisitId, setEditingVisitId] = useState<number | null>(null);
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [deletingVisitId, setDeletingVisitId] = useState<number | null>(null);
  const [deletingReportId, setDeletingReportId] = useState<number | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [form, setForm] = useState(defaultVisitForm);
  const [reportForm, setReportForm] = useState(defaultReportForm);
  const [prescriptionWarnings, setPrescriptionWarnings] = useState<PrescriptionSafetyWarningRecord[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingVisitPayload, setPendingVisitPayload] = useState<Record<string, unknown> | null>(null);

  const canCreateVisit = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR" || user?.role === "NURSE";
  const canAuthorReports = user?.role === "CENTER_MANAGER" || user?.role === "DOCTOR";

  async function loadPage() {
    const [visitsPayload, patientsPayload, workspacePayload] = await Promise.all([
      apiRequest<VisitRecord[]>("/center/visits"),
      apiRequest<LocalPatientRecord[]>("/center/patients"),
      apiRequest<CenterWorkspaceData>("/center/dashboard")
    ]);

    setVisits(visitsPayload.map((visit) => ({ ...visit, reports: ensureVisitReports(visit) })));
    setPatients(patientsPayload);
    setWorkspace(workspacePayload);
  }

  useEffect(() => {
    loadPage()
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (visits.length === 0) {
      setSelectedVisitId(null);
      return;
    }

    setSelectedVisitId((current) => (current && visits.some((visit) => visit.id === current) ? current : visits[0].id));
  }, [visits]);

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? null,
    [selectedVisitId, visits]
  );

  const visitStats = useMemo(
    () => ({
      totalVisits: visits.length,
      syncedVisits: visits.filter((visit) => visit.syncedToCentral || visit.syncState === "SYNCED").length,
      pendingVisits: visits.filter((visit) => !visit.syncedToCentral && visit.syncState !== "SYNCED").length,
      reports: visits.reduce((total, visit) => total + ensureVisitReports(visit).length, 0)
    }),
    [visits]
  );

  function resetVisitForm() {
    setForm(defaultVisitForm);
    setEditingVisitId(null);
  }

  function resetReportForm() {
    setReportForm(defaultReportForm);
    setEditingReportId(null);
  }

  function hydrateVisitForm(visit: VisitRecord) {
    const prescription = visit.prescriptions[0];

    setForm({
      patientId: String(visit.patientId),
      doctorId: visit.doctorId ? String(visit.doctorId) : "",
      visitDate: visit.visitDate.slice(0, 16),
      visitTime: visit.visitTime ?? "",
      visitType: visit.visitType,
      symptoms: visit.symptoms ?? "",
      bloodPressure: visit.bloodPressure ?? "",
      temperature: visit.temperature != null ? String(visit.temperature) : "",
      heartRate: visit.heartRate != null ? String(visit.heartRate) : "",
      diagnosis: visit.diagnosis,
      notes: visit.notes ?? "",
      prescriptionMedicine: prescription?.medicineName ?? "",
      prescriptionDosage: prescription?.dosage ?? "",
      prescriptionDuration: prescription?.duration ?? "",
      prescriptionInstructions: prescription?.instructions ?? ""
    });
    setEditingVisitId(visit.id);
    setSelectedVisitId(visit.id);
    setSuccessMessage("");
    setError("");
  }

  function hydrateReportForm(report: LocalVisitReportRecord) {
    setReportForm({
      title: report.title,
      category: report.category,
      reportUrl: report.reportUrl ?? "",
      summary: report.summary,
      findings: report.findings ?? "",
      recommendations: report.recommendations ?? "",
      recommendedFollowUp: report.recommendedFollowUp ?? "",
      shareWithPatient: report.shareWithPatient,
      attachment: report.attachment ?? null
    });
    setEditingReportId(report.id);
    setSuccessMessage("");
    setError("");
  }

  async function handleVisitSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    setError("");

    if (!form.patientId || !form.visitDate || !form.diagnosis.trim()) {
      setError("أكمل اختيار المريض وتاريخ الزيارة والتشخيص قبل الحفظ.");
      return;
    }

    const hasPrescriptionDraft =
      form.prescriptionMedicine.trim() || form.prescriptionDosage.trim() || form.prescriptionDuration.trim();

    if (
      hasPrescriptionDraft &&
      (!form.prescriptionMedicine.trim() || !form.prescriptionDosage.trim() || !form.prescriptionDuration.trim())
    ) {
      setError("أكمل اسم الدواء والجرعة والمدة العلاجية، أو اترك بيانات الوصفة فارغة بالكامل.");
      return;
    }

    const temperature = form.temperature.trim() ? Number(form.temperature) : undefined;
    const heartRate = form.heartRate.trim() ? Number(form.heartRate) : undefined;

    if (
      (temperature !== undefined && !Number.isFinite(temperature)) ||
      (heartRate !== undefined && !Number.isFinite(heartRate))
    ) {
      setError("أدخل درجة الحرارة ومعدل النبض كأرقام صحيحة.");
      return;
    }

    const prescriptions =
      form.prescriptionMedicine.trim() && form.prescriptionDosage.trim() && form.prescriptionDuration.trim()
        ? [
            {
              medicineName: form.prescriptionMedicine.trim(),
              dosage: form.prescriptionDosage.trim(),
              duration: form.prescriptionDuration.trim(),
              instructions: form.prescriptionInstructions.trim() || undefined
            }
          ]
        : [];

    const method = editingVisitId ? "PUT" : "POST";
    const path = editingVisitId ? `/center/visits/${editingVisitId}` : "/center/visits";
    const visitPayload = {
      patientId: Number(form.patientId),
      doctorId: form.doctorId ? Number(form.doctorId) : undefined,
      visitDate: form.visitDate,
      visitTime: form.visitTime || undefined,
      visitType: form.visitType,
      symptoms: form.symptoms.trim() || undefined,
      bloodPressure: form.bloodPressure.trim() || undefined,
      temperature,
      heartRate,
      diagnosis: form.diagnosis.trim(),
      notes: form.notes.trim() || undefined,
      prescriptions
    };

    try {
      setSubmittingVisit(true);
      await apiRequest(path, {
        method,
        body: JSON.stringify(visitPayload)
      });

      setPrescriptionWarnings([]);
      setPendingVisitPayload(null);
      setOverrideReason("");
      resetVisitForm();
      await loadPage();
      setError("");
      setSuccessMessage(editingVisitId ? "تم تحديث الزيارة المحلية بنجاح." : "تم حفظ الزيارة المحلية بنجاح.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الزيارة.");
      setSuccessMessage("");
      const warnings = extractPrescriptionWarnings(cause);

      if (warnings.length > 0) {
        setPrescriptionWarnings(warnings);
        setPendingVisitPayload(visitPayload);
        setError("");
        setSuccessMessage("");
        return;
      }
    } finally {
      setSubmittingVisit(false);
    }
  }

  async function confirmVisitPrescriptionOverride() {
    if (!pendingVisitPayload) {
      return;
    }

    if (hasHighSeverityWarning(prescriptionWarnings) && !overrideReason.trim()) {
      setError("High severity prescription warnings require an override reason.");
      return;
    }

    const method = editingVisitId ? "PUT" : "POST";
    const path = editingVisitId ? `/center/visits/${editingVisitId}` : "/center/visits";

    try {
      setSubmittingVisit(true);
      await apiRequest(path, {
        method,
        body: JSON.stringify({
          ...pendingVisitPayload,
          overridePrescriptionWarnings: true,
          overrideReason: overrideReason.trim() || undefined
        })
      });
      setPrescriptionWarnings([]);
      setPendingVisitPayload(null);
      setOverrideReason("");
      resetVisitForm();
      await loadPage();
      setError("");
      setSuccessMessage("Visit and prescription were saved after safety confirmation.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save visit after confirmation.");
      setSuccessMessage("");
    } finally {
      setSubmittingVisit(false);
    }
  }

  async function handleDeleteVisit(visit: VisitRecord) {
    if (!window.confirm("هل تريد حذف هذه الزيارة المحلية؟")) {
      return;
    }

    try {
      setDeletingVisitId(visit.id);
      await apiRequest(`/center/visits/${visit.id}`, {
        method: "DELETE"
      });

      if (editingVisitId === visit.id) {
        resetVisitForm();
      }

      if (selectedVisitId === visit.id) {
        resetReportForm();
      }

      await loadPage();
      setError("");
      setSuccessMessage("تم حذف الزيارة المحلية.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف الزيارة.");
      setSuccessMessage("");
    } finally {
      setDeletingVisitId(null);
    }
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (file.size > 2_500_000) {
      setError("حجم الملف كبير. اختر ملفًا أصغر من 2.5 ميغابايت.");
      event.target.value = "";
      return;
    }

    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      setError("الأنواع المدعومة هي PDF وPNG وJPG وWEBP فقط.");
      event.target.value = "";
      return;
    }

    try {
      setUploadingAttachment(true);
      const contentBase64 = await readFileAsBase64(file);
      setReportForm((current) => ({
        ...current,
        attachment: {
          fileName: file.name,
          mimeType: file.type,
          contentBase64
        }
      }));
      setError("");
    } catch {
      setError("تعذر تجهيز الملف للرفع. حاول مرة أخرى.");
    } finally {
      setUploadingAttachment(false);
      event.target.value = "";
    }
  }

  async function handleReportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    setError("");

    if (!selectedVisit) {
      setError("اختر زيارة أولًا قبل إنشاء التقرير.");
      return;
    }

    if (!reportForm.title.trim() || !reportForm.reportUrl.trim()) {
      setError("أكمل عنوان التقرير ورابط التقرير قبل الحفظ.");
      return;
    }

    try {
      const reportUrl = new URL(reportForm.reportUrl.trim());
      if (!["http:", "https:"].includes(reportUrl.protocol)) {
        throw new Error("Invalid report URL protocol");
      }
    } catch {
      setError("أدخل رابط تقرير صالح يبدأ بـ http أو https.");
      return;
    }

    const method = editingReportId ? "PUT" : "POST";
    const path = editingReportId
      ? `/center/visits/${selectedVisit.id}/reports/${editingReportId}`
      : `/center/visits/${selectedVisit.id}/reports`;

    try {
      setSubmittingReport(true);
      await apiRequest(path, {
        method,
        body: JSON.stringify({
          title: reportForm.title.trim(),
          category: reportForm.category,
          reportUrl: reportForm.reportUrl.trim(),
          summary: reportForm.summary.trim() || undefined,
          shareWithPatient: reportForm.shareWithPatient,
          attachment: null
        })
      });

      resetReportForm();
      await loadPage();
      setSelectedVisitId(selectedVisit.id);
      setError("");
      setSuccessMessage(
        reportForm.shareWithPatient
          ? "تم إرسال التقرير للمريض."
          : "تم حفظ رابط التقرير كداخلي فقط ولن يظهر للمريض."
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ تقرير النتائج.");
      setSuccessMessage("");
    } finally {
      setSubmittingReport(false);
    }
  }

  async function handleDeleteReport(visit: VisitRecord, report: LocalVisitReportRecord) {
    if (!window.confirm("هل تريد حذف تقرير النتائج هذا؟")) {
      return;
    }

    try {
      setDeletingReportId(report.id);
      await apiRequest(`/center/visits/${visit.id}/reports/${report.id}`, {
        method: "DELETE"
      });

      if (editingReportId === report.id) {
        resetReportForm();
      }

      await loadPage();
      setSelectedVisitId(visit.id);
      setError("");
      setSuccessMessage("تم حذف تقرير النتائج.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حذف تقرير النتائج.");
      setSuccessMessage("");
    } finally {
      setDeletingReportId(null);
    }
  }

  function applySmartDraft() {
    if (!selectedVisit) {
      return;
    }

    setReportForm(buildSmartReportDraft(selectedVisit));
    setEditingReportId(null);
  }

  function applyReportTemplate(category: string) {
    if (!selectedVisit) {
      setError("اختر زيارة أولاً قبل اختيار قالب التقرير.");
      return;
    }

    const draft = buildStructuredReportDraft(selectedVisit, category);
    setReportForm((current) => ({
      ...draft,
      attachment: current.attachment
    }));
    setEditingReportId(null);
    setSuccessMessage("");
    setError("");
  }

  return (
    <div className="page-stack visit-operations-page">
      {successMessage ? <div className="success-banner">{successMessage}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}
      {prescriptionWarnings.length > 0 && pendingVisitPayload ? (
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
            <button className="primary-button" disabled={submittingVisit} onClick={() => void confirmVisitPrescriptionOverride()} type="button">
              Confirm and save
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                setPrescriptionWarnings([]);
                setPendingVisitPayload(null);
                setOverrideReason("");
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <section className="hero-strip visit-hero-shell">
        <div className="hero-copy-block">
          <p className="eyebrow">Report Links</p>
          <h1>إدارة الزيارات وتقارير النتائج</h1>
          <p className="muted">
            مساحة عمل موحّدة لتوثيق الزيارة، ثم مشاركة رابط التقرير الجاهز مع المريض ليُفتح في صفحة مستقلة.
          </p>
        </div>
        <div className="workflow-scene-shell">
          <div className="scene-stat-row" aria-hidden="true">
            <span>{visitStats.pendingVisits} قيد المزامنة</span>
            <span>{visitStats.reports} تقرير</span>
          </div>
          <div className="chip-row">
            <button
              className="primary-button"
              type="button"
              onClick={resetReportForm}
            >
              رابط تقرير جديد
            </button>
            <button className="ghost-button" type="button" onClick={resetReportForm}>
              تقرير جديد
            </button>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="eyebrow">إجمالي الزيارات</span>
          <h3>{visitStats.totalVisits}</h3>
          <p className="muted">كل الزيارات المحلية الموثقة داخل المركز.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">زيارات بانتظار المزامنة</span>
          <h3>{visitStats.pendingVisits}</h3>
          <p className="muted">تحتاج إلى مزامنة مع النظام المركزي أو متابعة تشغيلية.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">تقارير النتائج</span>
          <h3>{visitStats.reports}</h3>
          <p className="muted">تقارير منشأة من الأطباء ومرتبطة بزيارات فعلية.</p>
        </article>
        <article className="metric-card">
          <span className="eyebrow">زيارات مكتملة المزامنة</span>
          <h3>{visitStats.syncedVisits}</h3>
          <p className="muted">أرشفة مستقرة وجاهزة للرجوع داخل الشبكة الصحية.</p>
        </article>
      </section>

      {canCreateVisit ? (
        <SectionCard
          title={editingVisitId ? "تعديل زيارة محلية" : "تسجيل زيارة محلية"}
          subtitle="احتفظ بتوثيق الزيارة كاملًا ثم أكمل عليها بالتقرير الطبي أو خطة المتابعة."
          action={
            editingVisitId ? (
              <button className="ghost-button" onClick={resetVisitForm} type="button">
                إلغاء التعديل
              </button>
            ) : undefined
          }
          className="visit-builder-card"
        >
          <form className="form-grid" onSubmit={handleVisitSubmit}>
            <label className="field">
              <span>المريض</span>
              <select
                value={form.patientId}
                required
                onChange={(event) => setForm((current) => ({ ...current, patientId: event.target.value }))}
              >
                <option value="">اختر المريض</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>المعالج</span>
              <select
                value={form.doctorId}
                onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))}
              >
                <option value="">استخدم المستخدم الحالي</option>
                {workspace?.team
                  .filter((member) => member.role === "DOCTOR")
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.specialization ? `${member.fullName} - ${member.specialization}` : member.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              <span>تاريخ ووقت الزيارة</span>
              <input
                type="datetime-local"
                value={form.visitDate}
                required
                onChange={(event) => setForm((current) => ({ ...current, visitDate: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الوقت المختصر</span>
              <input
                type="time"
                value={form.visitTime}
                onChange={(event) => setForm((current) => ({ ...current, visitTime: event.target.value }))}
                placeholder="11:20"
              />
            </label>
            <label className="field">
              <span>نوع الزيارة</span>
              <select
                value={form.visitType}
                onChange={(event) => setForm((current) => ({ ...current, visitType: event.target.value }))}
              >
                <option value="CONSULTATION">{toArabicLabel("CONSULTATION")}</option>
                <option value="EMERGENCY">{toArabicLabel("EMERGENCY")}</option>
                <option value="FOLLOW_UP">{toArabicLabel("FOLLOW_UP")}</option>
                <option value="LAB">{toArabicLabel("LAB")}</option>
              </select>
            </label>
            <label className="field">
              <span>الضغط الشرياني</span>
              <input
                value={form.bloodPressure}
                onChange={(event) => setForm((current) => ({ ...current, bloodPressure: event.target.value }))}
                placeholder="120/80"
              />
            </label>
            <label className="field field-span-2">
              <span>الأعراض</span>
              <textarea
                value={form.symptoms}
                onChange={(event) => setForm((current) => ({ ...current, symptoms: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>درجة الحرارة</span>
              <input
                value={form.temperature}
                inputMode="decimal"
                onChange={(event) => setForm((current) => ({ ...current, temperature: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>معدل النبض</span>
              <input
                value={form.heartRate}
                inputMode="numeric"
                onChange={(event) => setForm((current) => ({ ...current, heartRate: event.target.value }))}
              />
            </label>
            <label className="field field-span-2">
              <span>التشخيص</span>
              <input
                value={form.diagnosis}
                required
                onChange={(event) => setForm((current) => ({ ...current, diagnosis: event.target.value }))}
              />
            </label>
            <label className="field field-span-2">
              <span>الملاحظات السريرية</span>
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>الدواء الموصوف</span>
              <input
                value={form.prescriptionMedicine}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionMedicine: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>الجرعة</span>
              <input
                value={form.prescriptionDosage}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionDosage: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>المدة العلاجية</span>
              <input
                value={form.prescriptionDuration}
                onChange={(event) =>
                  setForm((current) => ({ ...current, prescriptionDuration: event.target.value }))
                }
              />
            </label>
            <label className="field">
              <span>تعليمات الاستخدام</span>
              <input
                value={form.prescriptionInstructions}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    prescriptionInstructions: event.target.value
                  }))
                }
              />
            </label>
            <div className="field-span-2 button-row">
              <button className="primary-button" disabled={submittingVisit} type="submit">
                {submittingVisit ? "جارٍ الحفظ..." : editingVisitId ? "حفظ التعديلات" : "حفظ الزيارة"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <section className="split-grid">
        <SectionCard
          title="روابط تقارير النتائج"
          subtitle="اختر زيارة من القائمة ثم أضف رابط التقرير الذي سيظهر للمريض ويفتح في صفحة جديدة."
          className="visit-report-studio"
        >
          {selectedVisit ? (
            <div className="page-stack">
              <div className="profile-tile is-selected visit-report-highlight">
                <p className="eyebrow">الزيارة المختارة</p>
                <h3>{selectedVisit.patientName}</h3>
                <p>{selectedVisit.diagnosis}</p>
                <div className="tile-stats">
                  <span>{selectedVisit.doctorName}</span>
                  <span>{formatDateTime(selectedVisit.visitDate)}</span>
                  <span>{toArabicLabel(selectedVisit.visitType)}</span>
                  {selectedVisit.visitSource === "REFERRAL" ? <span>زيارة محوّلة</span> : null}
                  <span>{ensureVisitReports(selectedVisit).length} تقارير</span>
                </div>
                {selectedVisit.referral ? (
                  <div className="inline-note">
                    محوّل من: {selectedVisit.referral.fromCenter} | سبب الإحالة: {selectedVisit.referral.reason} |
                    التخصص المطلوب: {selectedVisit.referral.requiredSpecialty}
                  </div>
                ) : null}
              </div>

              {canAuthorReports ? (
                <form className="form-grid" onSubmit={handleReportSubmit}>
                  <label className="field field-span-2">
                    <span>عنوان التقرير</span>
                    <input
                      value={reportForm.title}
                      required
                      onChange={(event) => setReportForm((current) => ({ ...current, title: event.target.value }))}
                      placeholder="مثال: ملخص نتائج متابعة القلب"
                    />
                  </label>
                  <label className="field">
                    <span>فئة التقرير</span>
                    <select
                      value={reportForm.category}
                      onChange={(event) =>
                        setReportForm((current) => ({ ...current, category: event.target.value }))
                      }
                    >
                      {reportCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field report-checkbox-field">
                    <span>إتاحة للمريض</span>
                    <label className="switch-label">
                      <input
                        checked={reportForm.shareWithPatient}
                        onChange={(event) =>
                          setReportForm((current) => ({
                            ...current,
                            shareWithPatient: event.target.checked
                          }))
                        }
                        type="checkbox"
                      />
                      <strong>{reportForm.shareWithPatient ? "مشارك في السجل الصحي" : "داخلي فقط"}</strong>
                    </label>
                  </label>
                  <label className="field field-span-2">
                    <span>رابط التقرير للمريض</span>
                    <input
                      dir="ltr"
                      type="url"
                      value={reportForm.reportUrl}
                      required
                      onChange={(event) => setReportForm((current) => ({ ...current, reportUrl: event.target.value }))}
                      placeholder="https://example.com/report.pdf"
                    />
                    <small className="muted">سيظهر هذا الرابط للمريض في السجل الصحي ويفتح في تبويب جديد.</small>
                  </label>
                  <label className="field field-span-2">
                    <span>ملاحظة مختصرة للمريض</span>
                    <textarea
                      value={reportForm.summary}
                      onChange={(event) => setReportForm((current) => ({ ...current, summary: event.target.value }))}
                      placeholder="مثال: نتائج المختبر جاهزة للمراجعة، يرجى فتح الرابط للاطلاع عليها."
                    />
                  </label>
                  <div className="field-span-2 button-row">
                    <button
                      className="primary-button"
                      disabled={submittingReport}
                      type="submit"
                    >
                      {submittingReport
                        ? "جارٍ حفظ التقرير..."
                        : editingReportId
                          ? "تحديث التقرير"
                          : "إنشاء التقرير"}
                    </button>
                    {editingReportId ? (
                      <button className="ghost-button" onClick={resetReportForm} type="button">
                        إلغاء التعديل
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : (
                <div className="empty-state compact">يمكن للطبيب أو مدير المركز فقط إنشاء تقارير النتائج.</div>
              )}

              <div className="stack-list">
                {ensureVisitReports(selectedVisit).map((report) => (
                  <article className="stack-item interactive-card report-focus-card" key={report.id}>
                    <strong>{report.title}</strong>
                    <p>{report.summary}</p>
                    <div className="tile-stats">
                      <span>{getReportCategoryLabel(report.category)}</span>
                      <span>{report.authorName}</span>
                      <span>{formatDateTime(report.createdAt)}</span>
                      <span>{report.shareWithPatient ? "مرئي للمريض" : "داخلي"}</span>
                    </div>
                    {report.reportUrl ? <p className="muted">الرابط جاهز للفتح من سجل المريض.</p> : null}
                    {report.recommendedFollowUp ? <p className="muted">المتابعة: {report.recommendedFollowUp}</p> : null}
                    <div className="button-row">
                      {report.reportUrl ? (
                        <a className="primary-button" href={report.reportUrl} rel="noreferrer" target="_blank">
                          فتح التقرير
                        </a>
                      ) : null}
                      {canAuthorReports ? (
                        <button className="ghost-button" onClick={() => hydrateReportForm(report)} type="button">
                          تعديل
                        </button>
                      ) : null}
                      {report.attachment ? (
                        <button
                          className="ghost-button"
                          onClick={() => {
                            const link = document.createElement("a");
                            link.href = `data:${report.attachment!.mimeType};base64,${report.attachment!.contentBase64}`;
                            link.download = report.attachment!.fileName;
                            link.click();
                          }}
                          type="button"
                        >
                          تنزيل المرفق
                        </button>
                      ) : null}
                      {canAuthorReports ? (
                        <button
                          className="danger-button"
                          disabled={deletingReportId === report.id}
                          onClick={() => void handleDeleteReport(selectedVisit, report)}
                          type="button"
                        >
                          {deletingReportId === report.id ? "جارٍ الحذف..." : "حذف"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
                {ensureVisitReports(selectedVisit).length === 0 ? (
                  <div className="empty-state compact">لا توجد تقارير نتائج لهذه الزيارة بعد.</div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="empty-state compact">لا توجد زيارة محددة حاليًا.</div>
          )}
        </SectionCard>

        <SectionCard
          title="الزيارات الحديثة"
          subtitle="اختر زيارة لفتح استوديو التقارير أو لتعديل بياناتها التشغيلية."
          className="visit-stream-card"
        >
          <div className="stack-list compact">
            {visits.map((visit) => {
              const canMutate = !visit.syncedToCentral && visit.syncState !== "SYNCED";

              return (
                <article
                  className={`profile-tile interactive-card ${selectedVisitId === visit.id ? "is-selected" : ""}`.trim()}
                  key={visit.id}
                >
                  <p className="eyebrow">{toArabicLabel(visit.visitType)}</p>
                  <h3>{visit.patientName}</h3>
                  <p>{visit.diagnosis}</p>
                  {visit.referral ? (
                    <p className="muted">
                      زيارة محوّلة من {visit.referral.fromCenter} إلى {visit.referral.requiredSpecialty}
                    </p>
                  ) : null}
                  <div className="tile-stats">
                    <span>{visit.doctorName}</span>
                    <span>{formatDateTime(visit.visitDate)}</span>
                    {visit.visitSource === "REFERRAL" ? <span>محوّل</span> : null}
                    <span>{ensureVisitReports(visit).length} تقارير</span>
                  </div>
                  <div className="button-row">
                    <button className="primary-button" onClick={() => setSelectedVisitId(visit.id)} type="button">
                      إدارة التقارير
                    </button>
                    {canMutate ? (
                      <button className="ghost-button" onClick={() => hydrateVisitForm(visit)} type="button">
                        تعديل
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {loading ? <div className="empty-state compact">جارٍ تحميل الزيارات...</div> : null}
            {!loading && visits.length === 0 ? <div className="empty-state compact">لا توجد زيارات محلية مسجلة بعد.</div> : null}
          </div>
        </SectionCard>
      </section>

      <SectionCard
        title="سجل الزيارات المحلي"
        subtitle="عرض تفصيلي لحالة المزامنة والأرشفة وعدد التقارير المرتبطة بكل زيارة."
      >
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>المريض</th>
                <th>المعالج</th>
                <th>التشخيص</th>
                <th>التقارير</th>
                <th>المزامنة</th>
                <th>التوقيت</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => {
                const canMutate = !visit.syncedToCentral && visit.syncState !== "SYNCED";

                return (
                  <tr key={visit.id}>
                    <td>
                      <strong>{visit.patientName}</strong>
                      <span>{toArabicLabel(visit.visitType)}</span>
                      {visit.visitSource === "REFERRAL" ? <span>زيارة محوّلة</span> : null}
                    </td>
                    <td>{visit.doctorName}</td>
                    <td>
                      <strong>{visit.diagnosis}</strong>
                      {visit.referral ? (
                        <span>
                          محوّل من: {visit.referral.fromCenter} | {visit.referral.requiredSpecialty}
                        </span>
                      ) : null}
                      <span>{visit.prescriptionCount} وصفات دوائية</span>
                    </td>
                    <td>
                      <strong>{ensureVisitReports(visit).length}</strong>
                      <span>{ensureVisitReports(visit).some((report) => report.shareWithPatient) ? "يوجد مشاركة للمريض" : "داخلي فقط"}</span>
                    </td>
                    <td>
                      <StatusBadge status={visit.syncState} />
                    </td>
                    <td>{formatDateTime(visit.visitDate)}</td>
                    <td>
                      <div className="button-row table-actions">
                        <button className="ghost-button" onClick={() => setSelectedVisitId(visit.id)} type="button">
                          التقارير
                        </button>
                        {canMutate ? (
                          <>
                            <button className="ghost-button" onClick={() => hydrateVisitForm(visit)} type="button">
                              تعديل
                            </button>
                            <button
                              className="danger-button"
                              disabled={deletingVisitId === visit.id}
                              onClick={() => void handleDeleteVisit(visit)}
                              type="button"
                            >
                              {deletingVisitId === visit.id ? "جارٍ الحذف..." : "حذف"}
                            </button>
                          </>
                        ) : (
                          <span className="muted">الزيارة المتزامنة للعرض فقط</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && visits.length === 0 ? <div className="empty-state compact">لا توجد زيارات محلية مسجلة بعد.</div> : null}
        </div>
      </SectionCard>
    </div>
  );
}

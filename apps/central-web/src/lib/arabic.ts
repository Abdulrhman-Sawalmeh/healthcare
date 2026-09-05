const labelMap: Record<string, string> = {
  CENTRAL_ADMIN: "مدير النظام المركزي",
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف الاستقبال",
  LAB_TECH: "فني مختبر",
  PHARMACIST: "صيدلي",
  NURSE: "ممرض",
  SYSTEM: "تنبيه نظامي",
  central: "النظام المركزي",
  center: "المركز الصحي",
  legacy: "بوابة المريض",
  CLINIC: "مركز صحي صغير",
  MEDICAL_CENTER: "مركز صحي متوسط",
  HOSPITAL: "مستشفى",
  SCHEDULED: "مجدول",
  CONFIRMED: "مؤكد",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
  NO_SHOW: "لم يحضر",
  CONSULTATION: "استشارة",
  CLINIC_VISIT: "زيارة عيادية",
  TELEMEDICINE: "استشارة عن بعد",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طارئ",
  LAB: "مختبر",
  MALE: "ذكر",
  FEMALE: "أنثى",
  OTHER: "آخر",
  PREFER_NOT_TO_SAY: "يفضل عدم الإفصاح",
  HIGH: "مرتفع",
  NORMAL: "عادي",
  URGENT: "عاجل",
  APPOINTMENT: "موعد",
  REFERRAL: "إحالة",
  MESSAGE: "رسالة",
  PAYMENT: "دفعة",
  MONTHLY: "شهري",
  QUARTERLY: "ربع سنوي",
  YEARLY: "سنوي",
  PENDING: "قيد الانتظار",
  PROCESSING: "قيد المعالجة",
  FAILED: "فشل الإرسال",
  PERMANENT_FAILURE: "فشل نهائي",
  ACKNOWLEDGED: "تم الاستلام",
  SENT: "مرسل",
  IN_PROGRESS: "قيد التنفيذ",
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  syncing: "قيد المزامنة",
  synced: "تمت المزامنة",
  sent: "مرسل",
  acknowledged: "تم الاستلام",
  completed: "مكتمل",
  COMPLETED_OR_SYNCED: "مكتملة أو متزامنة",
  INCOMPLETE_OR_PENDING_SYNC: "غير مكتملة أو بانتظار المزامنة",
  failed: "فشل",
  permanent_failure: "فشل نهائي",
  accepted: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغى",
  active: "نشط",
  inactive: "غير نشط",
  connected: "متصل",
  suspended: "موقوف",
  available: "متوفر",
  warning: "تنبيه",
  error: "خطأ",
  success: "ناجح",
  found: "تم العثور عليه",
  not_found: "غير موجود",
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئيا",
  paid: "مدفوع",
  REQUEST_NEW_VISITS: "طلب مزامنة الزيارات الجديدة",
  REQUEST_PATIENT_DATA: "طلب بيانات مريض",
  REQUEST_LAB_RESULTS: "طلب نتائج المختبر",
  SYNC_MASTER_DATA: "مزامنة البيانات المرجعية",
  PING: "فحص الاتصال",
  NOTIFY_REFERRAL: "إشعار إحالة",
  NOTIFY_REFERRAL_RESPONSE: "استجابة إحالة",
  REFERRAL_REQUEST: "طلب إحالة",
  ALERT: "تنبيه نظامي",
  TO_CENTER: "صادر إلى المركز",
  FROM_CENTER: "وارد من المركز",
  REQUESTED: "طلب جديد",
  AUTO_SELECTED: "تم اختيار مركز تلقائيا",
  PENDING_RECEIVING_MANAGER: "بانتظار قرار مدير المركز المستقبل",
  RECEIVING_MANAGER_ACCEPTED: "مقبولة من مدير المركز",
  RECEIVING_MANAGER_REJECTED: "مرفوضة من مدير المركز",
  NO_CANDIDATE_REJECTED: "مرفوضة لعدم توفر مركز مناسب",
  ASSIGNED_TO_DOCTOR: "مُسندة لطبيب",
  VISIT_CREATED: "تم إنشاء زيارة",
  RETURNED_WITH_REASON: "مُعادة مع سبب",
  LOGIN: "تسجيل دخول / LOGIN",
  REFERRAL_CREATED: "إنشاء إحالة / REFERRAL_CREATED",
  REFERRAL_AUTO_SELECTED: "اختيار مركز تلقائيا / REFERRAL_AUTO_SELECTED",
  REFERRAL_PENDING_MANAGER_REVIEW: "بانتظار مراجعة المدير / REFERRAL_PENDING_MANAGER_REVIEW",
  REFERRAL_NO_CANDIDATE_REJECTED:
    "رفض لعدم توفر مركز مناسب / REFERRAL_NO_CANDIDATE_REJECTED",
  REFERRAL_ASSIGNED_TO_DOCTOR: "إسناد إحالة لطبيب / REFERRAL_ASSIGNED_TO_DOCTOR",
  REFERRAL_VISIT_CREATED: "إنشاء زيارة من إحالة / REFERRAL_VISIT_CREATED",
  VERIFY_PRESCRIPTION: "تحقق وصفة من الشبكة / VERIFY_PRESCRIPTION",
  LocalPrescription: "وصفة محلية",
  CentralReferral: "إحالة مركزية",
  CenterNotification: "إشعار وارد من مركز",
  CentralNotification: "إشعار صادر من المركزي",
  CommunicationLog: "سجل اتصال",
  Session: "جلسة",
  OutgoingNotification: "إشعار صادر",
  IncomingNotification: "إشعار وارد",
  normal: "عادي",
  urgent: "عاجل",
  emergency: "طارئ",
  snapshots: "لقطات الحالة",
  workflow: "مسار العمل"
};

const medicineUnitLabels: Record<string, string> = {
  tablet: "قرص",
  tablets: "قرص",
  pill: "قرص",
  capsule: "كبسولة",
  capsules: "كبسولة",
  ml: "مل",
  ampoule: "أمبول",
  ampule: "أمبول",
  dose: "جرعة",
  doses: "جرعة",
  vial: "قارورة",
  bottle: "عبوة",
  cream: "كريم",
  drops: "قطرات",
  "1": "قرص",
  "2": "كبسولة",
  "3": "مل",
  "4": "أمبول",
  "5": "جرعة"
};

function currentLocale() {
  return document.documentElement.lang === "en" ? "en-US" : "ar-EG";
}

export function normalizeArabicText(value?: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeArabicName(value?: string | null) {
  return normalizeArabicText(
    (value ?? "")
      .normalize("NFKC")
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/\u0640/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
  ).toLocaleLowerCase("ar");
}

export function isUnknownValue(value?: string | number | null) {
  if (value === null || value === undefined) {
    return true;
  }

  const normalized = String(value).trim();
  return !normalized || normalized === "-" || /^[?\s]+$/.test(normalized);
}

export function safeDisplay(value?: string | number | null, fallback = "غير متوفر") {
  return isUnknownValue(value) ? fallback : String(value);
}

export function cleanDemoText(value?: string | null, fallback = "غير متوفر") {
  if (isUnknownValue(value)) {
    return fallback;
  }

  const normalized = String(value).trim();
  const lower = normalized.toLowerCase();

  if (lower === "no doctors available") {
    return "لا يوجد أطباء متاحون";
  }

  if (lower === "no suitable center" || lower === "no candidate") {
    return "لا يوجد مركز مناسب";
  }

  return normalized.replaceAll("[[target:/", "").replaceAll("]]", "");
}

export function toArabicLabel(value?: string | null) {
  if (!value) {
    return "غير متوفر";
  }

  const normalized = value.trim();
  return (
    labelMap[normalized] ??
    labelMap[normalized.toUpperCase()] ??
    labelMap[normalized.toLowerCase()] ??
    normalized.replaceAll("_", " ").replaceAll("  ", " ").trim()
  );
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return "غير متوفر";
  }

  return new Intl.DateTimeFormat(currentLocale(), {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value?: string | Date | null) {
  if (!value) {
    return "غير متوفر";
  }

  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function formatCount(value?: number | null) {
  return new Intl.NumberFormat("ar-EG").format(value ?? 0);
}

export function formatMedicineUnit(value?: string | null) {
  if (isUnknownValue(value)) {
    return "غير متوفر";
  }

  const normalized = String(value).trim();
  return medicineUnitLabels[normalized] ?? medicineUnitLabels[normalized.toLowerCase()] ?? normalized;
}

export function joinMeta(parts: Array<string | number | undefined | null>) {
  const visible = parts.filter((part) => !isUnknownValue(part)).map((part) => String(part).trim());
  return visible.length > 0 ? visible.join(" • ") : "غير متوفر";
}

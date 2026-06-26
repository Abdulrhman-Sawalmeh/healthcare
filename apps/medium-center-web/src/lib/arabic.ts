const labelMap: Record<string, string> = {
  NEW: "وصفة جديدة",
  UNDER_REVIEW: "قيد المراجعة",
  PREPARING: "قيد التجهيز",
  DISPENSED: "تم الصرف",
  UNAVAILABLE: "غير متوفر",
  NEEDS_DOCTOR_REVIEW: "تحتاج مراجعة الطبيب",
  PENDING_SAMPLE: "بانتظار العينة",
  SAMPLE_RECEIVED: "العينة مستلمة",
  IN_PROGRESS: "قيد الفحص",
  RESULT_READY: "النتيجة جاهزة",
  SENT_TO_DOCTOR: "أُرسلت للطبيب",
  NEEDS_CORRECTION: "تحتاج تصحيح",
  PUBLISHED_TO_PATIENT: "منشورة للمريض",
  INVALID_SAMPLE: "عينة غير صالحة",
  CRITICAL: "حرج",
  ABNORMAL: "غير طبيعي",
  LAB_REQUEST_CREATED: "إنشاء طلب مختبر",
  LAB_SAMPLE_RECEIVED: "استلام عينة مختبر",
  LAB_RESULT_DRAFTED: "حفظ نتيجة مختبر",
  LAB_RESULT_SENT_TO_DOCTOR: "إرسال نتيجة للطبيب",
  LAB_RESULT_APPROVED: "اعتماد نتيجة المختبر",
  LAB_SAMPLE_INVALID: "عينة مختبر غير صالحة",
  LAB_RESULT_READY_TO_SEND: "نتيجة جاهزة للإرسال",
  LAB_RESULT_CRITICAL: "نتيجة مختبر حرجة",
  LAB_RESULT_RETURNED_FOR_CORRECTION: "إعادة نتيجة للتصحيح",
  LAB_RESULT_PUBLISHED_TO_PATIENT: "نشر نتيجة للمريض",
  LAB_RESULT_MARKED_CRITICAL: "تعليم نتيجة حرجة",
  LAB_RESULT_VIEWED: "معاينة نتيجة مختبر",
  CENTRAL_ADMIN: "مدير النظام المركزي",
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف استقبال",
  LAB_TECH: "فني مختبر",
  PHARMACIST: "صيدلي",
  NURSE: "ممرض",
  central: "النظام المركزي",
  center: "المركز الصحي",
  legacy: "بوابة المريض",
  CLINIC: "مركز صحي صغير",
  MEDICAL_CENTER: "مركز صحي متوسط",
  HOSPITAL: "مستشفى",
  MALE: "ذكر",
  FEMALE: "أنثى",
  OTHER: "آخر",
  PREFER_NOT_TO_SAY: "يفضل عدم الإفصاح",
  CONSULTATION: "استشارة",
  CLINIC_VISIT: "زيارة عيادية",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طارئ",
  LAB: "مختبر",
  NORMAL: "عادي",
  URGENT: "عاجل",
  HIGH: "مرتفع",
  LOW: "منخفض",
  REQUESTED: "طلب جديد",
  PENDING: "قيد الانتظار",
  PROCESSING: "قيد المعالجة",
  SYNCING: "قيد المزامنة",
  SYNCED: "تمت المزامنة",
  SENT: "تم الإرسال",
  ACKNOWLEDGED: "تم الاستلام",
  COMPLETED: "مكتمل",
  FAILED: "فشل",
  PERMANENT_FAILURE: "فشل نهائي",
  CANCELLED: "ملغى",
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  UNPAID: "غير مدفوع",
  PARTIAL: "مدفوع جزئيا",
  PAID: "مدفوع",
  pending: "قيد الانتظار",
  processing: "قيد المعالجة",
  syncing: "قيد المزامنة",
  synced: "تمت المزامنة",
  sent: "تم الإرسال",
  acknowledged: "تم الاستلام",
  completed: "مكتمل",
  failed: "فشل",
  permanent_failure: "فشل نهائي",
  accepted: "مقبول",
  rejected: "مرفوض",
  cancelled: "ملغى",
  active: "نشط",
  inactive: "غير نشط",
  connected: "متصل",
  suspended: "موقوف",
  available: "متاح",
  warning: "تنبيه",
  error: "خطأ",
  success: "ناجح",
  found: "تم العثور عليه",
  not_found: "غير موجود",
  FOUND: "تم العثور عليه",
  NOT_FOUND: "غير موجود",
  LOCAL: "ملف محلي",
  LINKED: "مرتبط بالرقم الموحد",
  WAITING_RECEPTION: "بانتظار الاستقبال",
  WAITING_TRIAGE: "بانتظار التمريض",
  WAITING_DOCTOR: "بانتظار الطبيب",
  IN_TREATMENT: "قيد المعالجة",
  WAITING_LAB: "بانتظار المختبر",
  WAITING_PHARMACY: "بانتظار الصيدلية",
  READY_TO_UPLOAD: "جاهز للمزامنة",
  UPLOAD_PENDING: "قيد الرفع",
  UPLOADED: "تم الرفع",
  NOT_READY: "غير جاهز",
  READY: "جاهز",
  QUEUED: "في الطابور",
  REQUEST_NEW_VISITS: "طلب مزامنة الزيارات الجديدة",
  REQUEST_PATIENT_DATA: "طلب بيانات مريض",
  REQUEST_LAB_RESULTS: "طلب نتائج المختبر",
  SYNC_MASTER_DATA: "مزامنة البيانات المرجعية",
  PING: "فحص الاتصال",
  NOTIFY_REFERRAL: "إشعار إحالة",
  NOTIFY_REFERRAL_RESPONSE: "استجابة إحالة",
  REFERRAL_REQUEST: "طلب إحالة",
  REFERRAL_CREATED: "تم إرسال طلب إحالة",
  REFERRAL_MANAGER_ACCEPTED: "تم قبول الإحالة",
  REFERRAL_MANAGER_REJECTED: "تم رفض الإحالة",
  REFERRAL_ASSIGNED_TO_DOCTOR: "إحالة مسندة لطبيب",
  REFERRAL_VISIT_CREATED: "تم فتح زيارة للإحالة",
  REFERRAL_COMPLETED: "اكتملت الإحالة",
  ALERT: "تنبيه نظامي",
  TO_CENTER: "من النظام المركزي إلى المركز",
  FROM_CENTER: "من المركز إلى النظام المركزي",
  AUTO_SELECTED: "اختيار آلي",
  PENDING_RECEIVING_MANAGER: "بانتظار قرار مدير المركز المستقبل",
  RECEIVING_MANAGER_ACCEPTED: "قبلها مدير المركز",
  RECEIVING_MANAGER_REJECTED: "رفضها مدير المركز",
  NO_CANDIDATE_REJECTED: "مرفوضة لعدم توفر مركز مناسب",
  ASSIGNED_TO_DOCTOR: "مسندة لطبيب",
  VISIT_CREATED: "تم إنشاء زيارة",
  RETURNED_WITH_REASON: "معادة مع سبب",
  DOCTOR_APPROVED: "وافق الطبيب",
  PHARMACY_PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهزة للاستلام",
  COLLECTED: "تم الاستلام",
  REJECTED: "مرفوض",
  DONE: "منجز",
  MISSED: "فائت",
  CentralReferral: "إحالة مركزية",
  LocalVisit: "زيارة محلية",
  LocalPrescription: "وصفة محلية",
  LabRequestLocal: "طلب مختبر",
  FollowUpReminder: "تذكير متابعة",
  MedicationRefillRequest: "طلب تجديد دواء",
  VERIFY_PRESCRIPTION: "تحقق من وصفة",
  CREATE_PRESCRIPTION: "إنشاء وصفة",
  CREATE_VISIT: "إنشاء زيارة",
  QUEUE_VISIT: "فتح ملف زيارة",
  UPDATE_PATIENT: "تحديث ملف مريض",
  CREATE_DOCTOR: "إنشاء حساب طبيب",
  UPDATE_DOCTOR: "تحديث حساب طبيب",
  DISABLE_DOCTOR: "تعطيل حساب طبيب",
  INFO: "معلومة",
  WARNING: "تنبيه",
  ERROR: "خطأ",
  SYSTEM: "النظام الصحي",
  PRESCRIPTION_RECEIVED: "وصلت وصفة جديدة",
  PRESCRIPTION_VIEWED_BY_PHARMACIST: "تمت مراجعة الوصفة",
  PRESCRIPTION_PREPARATION_STARTED: "بدأ تجهيز الوصفة",
  PRESCRIPTION_READY_FOR_PICKUP: "وصفة جاهزة للاستلام",
  PRESCRIPTION_DISPENSED: "تم صرف وصفة",
  PRESCRIPTION_MEDICATION_UNAVAILABLE: "دواء غير متوفر",
  PRESCRIPTION_DOCTOR_REVIEW_REQUESTED: "طُلبت مراجعة الطبيب",
  PRESCRIPTION_DOCTOR_REVIEW_RESPONDED: "رد الطبيب على طلب المراجعة",
  INVENTORY_LOW_STOCK: "مخزون منخفض",
  INVENTORY_UPDATED: "تم تحديث المخزون",
  PRESCRIPTION_VERIFIED: "تم التحقق من وصفة",
  PharmacyInventoryLocal: "مخزون دواء"
};

function currentLocale() {
  return document.documentElement.lang === "en" ? "en-US" : "ar-EG";
}

export function toArabicLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  const normalized = String(value).trim();

  return (
    labelMap[normalized] ??
    labelMap[normalized.toUpperCase()] ??
    labelMap[normalized.toLowerCase()] ??
    normalized
      .replaceAll("_", " ")
      .replaceAll("  ", " ")
      .trim()
  );
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatDate(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat(currentLocale(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function joinMeta(parts: Array<string | number | undefined | null>) {
  return parts
    .map((part) => (part === undefined || part === null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" • ");
}

export function formatCount(value: number, singular: string, plural = singular) {
  return `${value.toLocaleString(currentLocale())} ${value === 1 ? singular : plural}`;
}

export function safeText(value?: string | number | null, fallback = "غير مسجل") {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value);
}

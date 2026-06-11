import { Role } from "../types";

export const roleLabels: Record<Role, string> = {
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف استقبال",
  LAB_TECH: "فني مختبر",
  PHARMACIST: "صيدلي",
  NURSE: "ممرض"
};

export const priorityLabels: Record<string, string> = {
  NORMAL: "عادي",
  MEDIUM: "متوسط",
  URGENT: "عاجل",
  EMERGENCY: "طارئ",
  HIGH: "مرتفع",
  LOW: "منخفض"
};

export const statusLabels: Record<string, string> = {
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  SCHEDULED: "مجدول",
  CONFIRMED: "مؤكد",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  NO_SHOW: "لم يحضر",
  PENDING: "قيد الانتظار",
  PROCESSING: "قيد المعالجة",
  FAILED: "فشل",
  SENT: "مرسل",
  SYNCED: "مرفوع",
  UNPAID: "غير مدفوع",
  PAID: "مدفوع",
  PARTIAL: "مدفوع جزئيا",
  WAITING_TRIAGE: "بانتظار التمريض",
  WAITING_DOCTOR: "بانتظار الطبيب",
  WAITING_LAB: "بانتظار المختبر",
  WAITING_PHARMACY: "بانتظار الصيدلية",
  IN_TREATMENT: "قيد المعالجة",
  READY_TO_UPLOAD: "جاهز للرفع",
  UPLOAD_PENDING: "قيد الرفع",
  NOT_READY: "غير جاهز",
  READY: "جاهز",
  QUEUED: "في الطابور",
  UPLOADED: "تم الرفع",
  REFERRAL_REQUEST: "طلب إحالة",
  APPOINTMENT: "موعد",
  RESULT_REPORT: "تقرير نتيجة",
  CREATE_DOCTOR: "إنشاء طبيب",
  UPDATE_DOCTOR: "تحديث طبيب",
  DELETE_DOCTOR: "حذف طبيب",
  CREATE_PATIENT: "إنشاء مريض",
  UPDATE_PATIENT: "تحديث مريض",
  VERIFY_PRESCRIPTION: "تحقق من وصفة",
  CREATE_REFERRAL: "إنشاء إحالة"
};

export const appointmentTypeLabels: Record<string, string> = {
  CLINIC: "زيارة عيادة",
  FOLLOW_UP: "متابعة",
  TELEMEDICINE: "استشارة عن بعد",
  LAB: "فحص مختبر",
  CONSULTATION: "استشارة",
  EMERGENCY: "طوارئ"
};

export const genderLabels: Record<string, string> = {
  MALE: "ذكر",
  FEMALE: "أنثى",
  OTHER: "آخر",
  PREFER_NOT_TO_SAY: "غير محدد"
};

export const workDayLabels: Record<string, string> = {
  SUNDAY: "الأحد",
  MONDAY: "الاثنين",
  TUESDAY: "الثلاثاء",
  WEDNESDAY: "الأربعاء",
  THURSDAY: "الخميس",
  FRIDAY: "الجمعة",
  SATURDAY: "السبت"
};

export function toArabicLabel(value?: string | null) {
  if (!value) return "غير محدد";
  return (
    statusLabels[value] ??
    priorityLabels[value] ??
    appointmentTypeLabels[value] ??
    genderLabels[value] ??
    workDayLabels[value] ??
    value
  );
}

export function joinMeta(values: Array<string | number | null | undefined>, fallback = "غير مسجل") {
  const cleaned = values
    .map((value) => (value === null || value === undefined ? "" : String(value).trim()))
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned.join(" | ") : fallback;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatMoney(value?: number | null, currency = "شيكل") {
  const amount = Number(value ?? 0);
  return `${amount.toFixed(2)} ${currency}`;
}

export function splitCsv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function tomorrowDateInput() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function combineDateAndTime(date: string, time: string) {
  const safeDate = date || tomorrowDateInput();
  const safeTime = time || "10:00";
  return new Date(`${safeDate}T${safeTime}:00`).toISOString();
}

const labelMap: Record<string, string> = {
  CENTRAL_ADMIN: "مدير النظام المركزي",
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف الاستقبال",
  LAB_TECH: "فني مختبر",
  PHARMACIST: "صيدلي",
  NURSE: "ممرض",
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
  TELEMEDICINE: "استشارة عن بُعد",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "حالة طارئة",
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
  SYSTEM: "تنبيه نظامي",
  MONTHLY: "شهري",
  QUARTERLY: "ربع سنوي",
  YEARLY: "سنوي",
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
  available: "متوفر",
  warning: "تنبيه",
  error: "خطأ",
  success: "ناجح",
  found: "تم العثور عليه",
  not_found: "غير موجود",
  unpaid: "غير مدفوع",
  partial: "مدفوع جزئيًا",
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
  TO_CENTER: "من النظام المركزي إلى المركز",
  FROM_CENTER: "من المركز إلى النظام المركزي"
};

const dateTimeFormatter = new Intl.DateTimeFormat("ar-EG", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const dateFormatter = new Intl.DateTimeFormat("ar-EG", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function toArabicLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return (
    labelMap[value] ??
    labelMap[value.toLowerCase()] ??
    value
      .replaceAll("_", " ")
      .replaceAll("  ", " ")
      .trim()
  );
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  return dateTimeFormatter.format(new Date(value));
}

export function formatDate(value?: string | Date | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}

export function joinMeta(parts: Array<string | undefined | null>) {
  return parts.filter(Boolean).join(" • ");
}

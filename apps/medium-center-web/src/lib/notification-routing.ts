import { Role, Workspace } from "../types";

type NotificationRouteContext = {
  role?: Role;
  workspace?: Workspace;
};

type NotificationRouteInput = NotificationRouteContext & {
  type?: string | null;
  title?: string | null;
  body?: string | null;
  targetUrl?: string | null;
};

function buildHaystack(parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function includesAny(source: string, terms: string[]) {
  return terms.some((term) => source.includes(term.toLowerCase()));
}

function resolveAppointmentsPath(context: NotificationRouteContext) {
  if (context.role === "PATIENT") {
    return "/appointments";
  }

  if (context.workspace === "center") {
    return "/visits";
  }

  return "/notifications";
}

function resolveReferralsPath(context: NotificationRouteContext) {
  if (context.role === "PATIENT") {
    return "/medical-record";
  }

  if (context.role === "CENTER_MANAGER") {
    return "/referrals?view=incoming";
  }

  if (context.role === "DOCTOR") {
    return "/referrals?view=assigned";
  }

  return "/referrals";
}

function resolvePatientsPath(context: NotificationRouteContext) {
  return context.role === "PATIENT" ? "/medical-record" : "/patients";
}

function resolveDoctorsPath(context: NotificationRouteContext) {
  return context.role === "PATIENT" ? "/doctors" : "/patients";
}

export function resolveNotificationPath(input: NotificationRouteInput) {
  if (input.targetUrl?.startsWith("/")) {
    return input.targetUrl;
  }

  const haystack = buildHaystack([input.type, input.title, input.body]);

  if (
    input.role === "LAB_TECH" &&
    includesAny(haystack, ["lab", "result", "sample", "مختبر", "نتيجة", "عينة"])
  ) {
    return "/lab";
  }

  if (includesAny(haystack, ["message", "chat", "رسالة", "محادثة"])) {
    return input.workspace === "central" ? "/notifications" : "/messages";
  }

  if (includesAny(haystack, ["appointment", "visit", "موعد", "حجز", "زيارة", "زياره"])) {
    return resolveAppointmentsPath(input);
  }

  if (includesAny(haystack, ["referral", "إحالة", "احالة"])) {
    return resolveReferralsPath(input);
  }

  if (includesAny(haystack, ["patient", "مريض", "مرضى"])) {
    return resolvePatientsPath(input);
  }

  if (includesAny(haystack, ["doctor", "طبيب", "أطباء"])) {
    return resolveDoctorsPath(input);
  }

  if (
    includesAny(haystack, [
      "refill",
      "medication",
      "follow-up",
      "follow up",
      "reminder",
      "تجديد",
      "دواء",
      "متابعة",
      "تذكير"
    ])
  ) {
    return input.role === "PATIENT" ? "/medical-record" : input.workspace === "center" ? "/patients" : "/notifications";
  }

  if (includesAny(haystack, ["master_data", "master data", "البيانات المرجعية"])) {
    return input.workspace === "central" ? "/master-data" : "/notifications";
  }

  if (
    includesAny(haystack, [
      "report",
      "reports",
      "result",
      "results",
      "lab",
      "radiology",
      "تقرير",
      "التقرير",
      "تقارير",
      "التقارير",
      "نتائج",
      "النتائج",
      "إحصاء"
    ])
  ) {
    if (input.role === "PATIENT") {
      return "/medical-record#reports";
    }

    return input.workspace === "central" ? "/reports" : "/notifications";
  }

  if (includesAny(haystack, ["center", "centers", "مركز", "مراكز"])) {
    return input.workspace === "central" ? "/centers" : "/notifications";
  }

  return "/notifications";
}

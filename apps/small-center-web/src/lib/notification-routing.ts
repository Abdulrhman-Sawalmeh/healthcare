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

function isReceptionRestrictedPath(path: string) {
  return path.startsWith("/referrals") || path.startsWith("/prescription-verification");
}

function resolveAppointmentsPath(context: NotificationRouteContext) {
  if (context.role === "PATIENT") {
    return "/appointments";
  }

  if (context.workspace === "center") {
    return context.role === "RECEPTIONIST" ? "/visit-workflow" : "/visits";
  }

  return "/notifications";
}

function resolveReferralsPath(context: NotificationRouteContext) {
  if (context.role === "PATIENT") {
    return "/medical-record";
  }

  if (context.role === "RECEPTIONIST") {
    return "/notifications";
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
  if (context.role === "RECEPTIONIST") {
    return "/visit-workflow";
  }

  return context.role === "PATIENT" ? "/doctors" : "/patients";
}

export function resolveNotificationPath(input: NotificationRouteInput) {
  if (input.targetUrl?.startsWith("/")) {
    return input.role === "RECEPTIONIST" && isReceptionRestrictedPath(input.targetUrl)
      ? "/notifications"
      : input.targetUrl;
  }

  const haystack = buildHaystack([input.type, input.title, input.body]);

  if (includesAny(haystack, ["message", "chat", "رسالة", "محادثة"])) {
    if (input.role === "RECEPTIONIST") {
      return "/notifications";
    }

    return input.workspace === "central" ? "/notifications" : "/messages";
  }

  if (includesAny(haystack, ["appointment", "visit", "موعد", "حجز", "زيارة"])) {
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

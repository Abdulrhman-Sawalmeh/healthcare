import { ApiError, apiRequest } from "./client";
import { AppointmentPriority, PortalAppointmentSuggestionRecord } from "../types";

interface AppointmentSuggestionsParams {
  doctorId: string;
  preferredDate: string;
  appointmentType: "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE";
  priority: AppointmentPriority;
}

const appointmentSuggestionPaths = ["/portal/appointments/suggestions", "/appointments/suggestions"] as const;

export async function requestAppointmentSuggestions({
  doctorId,
  preferredDate,
  appointmentType,
  priority
}: AppointmentSuggestionsParams) {
  const searchParams = new URLSearchParams({
    doctorId,
    preferredDate,
    appointmentType,
    priority
  });

  for (const path of appointmentSuggestionPaths) {
    try {
      return await apiRequest<PortalAppointmentSuggestionRecord[]>(`${path}?${searchParams.toString()}`);
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 404) {
        throw cause;
      }
    }
  }

  throw new ApiError("خدمة المواعيد المتاحة غير مفعلة على الخادم حاليًا. أعد تشغيل API الخاص بالمركز.", 404);
}

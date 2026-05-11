import {
  AppointmentPriority,
  PortalAppointmentSuggestionRecord,
  PortalDoctorRecord
} from "../types";

export type AppointmentBookingType = "CLINIC" | "FOLLOW_UP" | "TELEMEDICINE";

export interface AppointmentFormSnapshot {
  doctorId: string;
  type: AppointmentBookingType;
  priority: AppointmentPriority;
  reason: string;
  notes: string;
}

export interface BookingReasonPreset {
  id: string;
  label: string;
  reason: string;
  notes?: string;
  type: AppointmentBookingType;
  priority: AppointmentPriority;
}

export interface SmartBookingInsight {
  summary: string;
  recommendedPriority: AppointmentPriority;
  recommendedType: AppointmentBookingType;
  recommendedDoctor?: PortalDoctorRecord;
  recommendedSlot?: PortalAppointmentSuggestionRecord;
  carePathLabel: string;
  confidenceLabel: string;
  rationale: string[];
  warning?: string;
}

const emergencyKeywords = [
  "ألم صدر",
  "ضيق تنفس",
  "صعوبة تنفس",
  "نزيف",
  "إغماء",
  "فقدان وعي",
  "شلل",
  "اختناق"
];

const urgentKeywords = [
  "حمى",
  "حرارة",
  "التهاب",
  "تورم",
  "ألم شديد",
  "دوخة",
  "صداع",
  "قيء",
  "سعال شديد"
];

const telemedicineKeywords = [
  "نتائج",
  "تحليل",
  "تحاليل",
  "استشارة",
  "وصفة",
  "دواء",
  "تجديد",
  "مراجعة قصيرة"
];

const followUpKeywords = [
  "متابعة",
  "مراجعة",
  "بعد العملية",
  "بعد الجراحة",
  "استمرار العلاج",
  "إعادة تقييم"
];

const specialtyRules = [
  {
    symptomKeywords: ["صدر", "قلب", "خفقان", "ضغط"],
    specialtyKeywords: ["قلب", "cardio", "heart"]
  },
  {
    symptomKeywords: ["بطن", "معدة", "قولون", "هضم", "غثيان"],
    specialtyKeywords: ["باطني", "جهاز هضمي", "internal", "gastro"]
  },
  {
    symptomKeywords: ["جلد", "طفح", "حساسية", "حبوب"],
    specialtyKeywords: ["جلد", "derma", "skin"]
  },
  {
    symptomKeywords: ["عظم", "ركبة", "ظهر", "مفصل"],
    specialtyKeywords: ["عظام", "ortho", "joint"]
  },
  {
    symptomKeywords: ["طفل", "رضيع", "أطفال"],
    specialtyKeywords: ["أطفال", "pediatric", "child"]
  },
  {
    symptomKeywords: ["عين", "نظر"],
    specialtyKeywords: ["عيون", "ophth", "eye"]
  },
  {
    symptomKeywords: ["نفسية", "قلق", "اكتئاب", "توتر"],
    specialtyKeywords: ["نفس", "psy", "mental"]
  }
] as const;

export const bookingReasonPresets: BookingReasonPreset[] = [
  {
    id: "routine-checkup",
    label: "فحص دوري",
    reason: "أرغب في فحص دوري ومراجعة عامة للحالة الصحية.",
    type: "CLINIC",
    priority: "NORMAL"
  },
  {
    id: "follow-up-results",
    label: "متابعة نتائج",
    reason: "أحتاج إلى متابعة نتائج الفحوصات ومراجعة الخطة العلاجية.",
    type: "FOLLOW_UP",
    priority: "NORMAL"
  },
  {
    id: "medication-refill",
    label: "تجديد وصفة",
    reason: "أرغب في مراجعة العلاج الحالي وتجديد الوصفة الطبية.",
    type: "TELEMEDICINE",
    priority: "NORMAL"
  },
  {
    id: "urgent-pain",
    label: "ألم مفاجئ",
    reason: "أعاني من ألم مفاجئ وأحتاج إلى تقييم طبي سريع.",
    type: "CLINIC",
    priority: "URGENT"
  }
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function includesAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function findDoctorBySpecialty(doctors: PortalDoctorRecord[], specialtyKeywords: readonly string[]) {
  return doctors.find((doctor) =>
    specialtyKeywords.some((keyword) => normalizeText(doctor.specialization).includes(normalizeText(keyword)))
  );
}

function getRecommendedPriority(text: string, currentPriority: AppointmentPriority) {
  if (includesAny(text, emergencyKeywords)) {
    return "EMERGENCY";
  }

  if (includesAny(text, urgentKeywords)) {
    return "URGENT";
  }

  return currentPriority;
}

function getRecommendedType(text: string, currentType: AppointmentBookingType) {
  if (includesAny(text, followUpKeywords)) {
    return "FOLLOW_UP";
  }

  if (includesAny(text, telemedicineKeywords)) {
    return "TELEMEDICINE";
  }

  return currentType;
}

function getRecommendedDoctor(
  text: string,
  doctors: PortalDoctorRecord[],
  selectedDoctor?: PortalDoctorRecord
) {
  const matchedRule = specialtyRules.find((rule) => includesAny(text, rule.symptomKeywords));

  if (!matchedRule) {
    return selectedDoctor;
  }

  const specialtyDoctor = findDoctorBySpecialty(doctors, matchedRule.specialtyKeywords);
  return specialtyDoctor ?? selectedDoctor;
}

function getRecommendedSlot(
  suggestions: PortalAppointmentSuggestionRecord[],
  recommendedDoctor?: PortalDoctorRecord
) {
  if (suggestions.length === 0) {
    return undefined;
  }

  if (recommendedDoctor) {
    const doctorSuggestion = suggestions.find((suggestion) => suggestion.doctor.id === recommendedDoctor.id);
    if (doctorSuggestion) {
      return doctorSuggestion;
    }
  }

  return suggestions[0];
}

function getConfidenceLabel(text: string) {
  let signals = 0;

  if (includesAny(text, emergencyKeywords)) {
    signals += 2;
  }

  if (includesAny(text, urgentKeywords) || includesAny(text, followUpKeywords) || includesAny(text, telemedicineKeywords)) {
    signals += 1;
  }

  if (specialtyRules.some((rule) => includesAny(text, rule.symptomKeywords))) {
    signals += 1;
  }

  if (signals >= 3) {
    return "ثقة مرتفعة";
  }

  if (signals >= 1) {
    return "ثقة متوسطة";
  }

  return "ثقة أولية";
}

export function getSmartBookingInsight({
  form,
  doctors,
  selectedDoctor,
  suggestions
}: {
  form: AppointmentFormSnapshot;
  doctors: PortalDoctorRecord[];
  selectedDoctor?: PortalDoctorRecord;
  suggestions: PortalAppointmentSuggestionRecord[];
}): SmartBookingInsight {
  const text = normalizeText(`${form.reason} ${form.notes}`);
  const recommendedPriority = getRecommendedPriority(text, form.priority);
  const recommendedType = getRecommendedType(text, form.type);
  const recommendedDoctor = getRecommendedDoctor(text, doctors, selectedDoctor);
  const recommendedSlot = getRecommendedSlot(suggestions, recommendedDoctor);
  const rationale: string[] = [];

  if (recommendedType === "FOLLOW_UP") {
    rationale.push("المحتوى المكتوب يبدو أقرب إلى مراجعة أو متابعة لحالة قائمة.");
  } else if (recommendedType === "TELEMEDICINE") {
    rationale.push("الوصف يشير إلى استشارة قصيرة أو مراجعة نتائج قد تبدأ عن بُعد.");
  } else {
    rationale.push("الوصف الحالي يناسب زيارة عيادية حضورية للفحص المباشر.");
  }

  if (recommendedPriority === "EMERGENCY") {
    rationale.push("هناك كلمات مفتاحية تشير إلى حاجة لتقييم سريع جدًا.");
  } else if (recommendedPriority === "URGENT") {
    rationale.push("الحالة تبدو عاجلة نسبيًا ويفضل لها أقرب موعد متاح.");
  } else {
    rationale.push("لا توجد إشارات واضحة لحالة طارئة ضمن النص الحالي.");
  }

  if (recommendedDoctor) {
    rationale.push(`أقرب تطابق للتخصص المتاح هو ${recommendedDoctor.specialization}.`);
  }

  if (recommendedSlot) {
    rationale.push("تم العثور على موعد متاح يمكن استخدامه مباشرة لتسريع الحجز.");
  }

  if (recommendedPriority === "EMERGENCY") {
    return {
      summary: "المساعد الذكي يقترح التعامل مع هذه الحالة كأولوية عالية مع أقرب تقييم ممكن.",
      recommendedPriority,
      recommendedType: "CLINIC",
      recommendedDoctor,
      recommendedSlot,
      carePathLabel: "مسار عاجل",
      confidenceLabel: getConfidenceLabel(text),
      rationale,
      warning: "إذا كانت الحالة تتفاقم سريعًا أو بدت طارئة، لا تنتظر الحجز الإلكتروني وتوجّه للطوارئ فورًا."
    };
  }

  if (recommendedType === "TELEMEDICINE") {
    return {
      summary: "المساعد الذكي يرجّح أن تبدأ هذه الحالة باستشارة عن بُعد ثم التحويل لزيارة حضورية عند الحاجة.",
      recommendedPriority,
      recommendedType,
      recommendedDoctor,
      recommendedSlot,
      carePathLabel: "مسار مرن",
      confidenceLabel: getConfidenceLabel(text),
      rationale
    };
  }

  if (recommendedType === "FOLLOW_UP") {
    return {
      summary: "المساعد الذكي يقترح موعد متابعة مع الطبيب الأقرب لحالتك أو الطبيب المعالج السابق إن وُجد.",
      recommendedPriority,
      recommendedType,
      recommendedDoctor,
      recommendedSlot,
      carePathLabel: "مسار متابعة",
      confidenceLabel: getConfidenceLabel(text),
      rationale
    };
  }

  return {
    summary: "المساعد الذكي يرى أن زيارة عيادية حضورية في أقرب وقت مناسب هي الخيار الأكثر اتزانًا.",
    recommendedPriority,
    recommendedType,
    recommendedDoctor,
    recommendedSlot,
    carePathLabel: recommendedPriority === "URGENT" ? "مسار سريع" : "مسار اعتيادي",
    confidenceLabel: getConfidenceLabel(text),
    rationale
  };
}

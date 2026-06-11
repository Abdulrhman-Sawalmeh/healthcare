import { env } from "../config/env";
import { AppError } from "../middleware/error";

export type CareInsightContext = "PATIENT_SELF_CARE" | "CLINICAL_TRIAGE" | "FOLLOW_UP";

export interface CareInsightInput {
  message: string;
  patientAge?: number;
  gender?: string;
  chronicDiseases?: string;
  allergies?: string;
  currentMedications?: string;
  context: CareInsightContext;
  role: string;
  centerName?: string;
}

export interface CareInsightResponse {
  source: "openrouter" | "gemini" | "local-fallback";
  urgency: "LOW" | "ROUTINE" | "URGENT" | "EMERGENCY";
  summary: string;
  suggestedActions: string[];
  questionsForClinician: string[];
  redFlags: string[];
  selfCare: string[];
  disclaimer: string;
}

type GeminiPart = {
  text?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const disclaimer =
  "هذا مساعد داعم لاتخاذ القرار ولا يقدم تشخيصًا نهائيًا. عند وجود أعراض خطرة أو تدهور سريع يجب التواصل فورًا مع الطوارئ أو الطبيب المناوب.";

function compact(value?: string) {
  return value?.trim() || "غير مذكور";
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function inferUrgency(message: string): CareInsightResponse["urgency"] {
  const text = message.toLowerCase();
  const emergencyKeywords = [
    "chest pain",
    "shortness of breath",
    "loss of consciousness",
    "stroke",
    "seizure",
    "severe bleeding",
    "ألم صدر",
    "الم صدر",
    "ضيق نفس",
    "فقدان وعي",
    "تشنج",
    "نزيف شديد",
    "شلل",
    "جلطة"
  ];
  const urgentKeywords = [
    "high fever",
    "severe pain",
    "persistent vomiting",
    "dehydration",
    "uncontrolled diabetes",
    "حمى",
    "حرارة عالية",
    "ألم شديد",
    "الم شديد",
    "قيء مستمر",
    "جفاف",
    "سكري"
  ];

  if (includesAny(text, emergencyKeywords)) {
    return "EMERGENCY";
  }

  if ((text.includes("صدر") || text.includes("chest")) && (text.includes("نفس") || text.includes("breath") || text.includes("تعرق"))) {
    return "EMERGENCY";
  }

  if (includesAny(text, urgentKeywords)) {
    return "URGENT";
  }

  return "ROUTINE";
}

function buildLocalResponse(input: CareInsightInput): CareInsightResponse {
  const urgency = inferUrgency(input.message);
  const shortMessage = input.message.length > 210 ? `${input.message.slice(0, 210)}...` : input.message;
  const isPatient = input.context === "PATIENT_SELF_CARE";

  return {
    source: "local-fallback",
    urgency,
    summary: `تم رصد طلب متعلق بـ: ${shortMessage}`,
    suggestedActions:
      urgency === "EMERGENCY"
        ? [
            "توجيه الحالة فورًا إلى الطوارئ أو الطبيب المناوب.",
            "قياس العلامات الحيوية الأساسية وتوثيق وقت بداية الأعراض.",
            "عدم تأخير النقل أو التدخل بانتظار اكتمال بيانات إضافية."
          ]
        : urgency === "URGENT"
          ? [
              "ترتيب تقييم طبي في أقرب وقت داخل المركز.",
              "مراجعة العلامات الحيوية والأدوية الحالية والحساسيات قبل أي إجراء.",
              "تحديد ما إذا كانت الحالة تحتاج إحالة أو فحوصات مخبرية."
            ]
          : [
              isPatient ? "حجز موعد أو التواصل مع فريق الرعاية إذا استمرت الأعراض." : "إضافة الملاحظات إلى ملف الزيارة ومراجعتها مع الطبيب.",
              "تجهيز قائمة بالأعراض ومدتها والعوامل التي تزيدها أو تخففها.",
              "متابعة الحالة خلال 24-48 ساعة أو حسب توجيه الطبيب."
            ],
    questionsForClinician: [
      "متى بدأت الأعراض؟ وهل بدأت فجأة أم تدريجيًا؟",
      "هل توجد حرارة، ألم شديد، ضيق نفس، دوخة، أو فقدان وعي؟",
      "ما الأدوية المستخدمة حاليًا؟ وهل توجد حساسية دوائية؟",
      "هل توجد أمراض مزمنة أو حمل أو عملية حديثة؟"
    ],
    redFlags: [
      "ألم صدر أو ضيق نفس.",
      "فقدان وعي، تشنجات، ضعف مفاجئ، أو اضطراب كلام.",
      "نزيف شديد أو ألم لا يحتمل.",
      "تدهور سريع في الحالة العامة."
    ],
    selfCare:
      urgency === "EMERGENCY"
        ? ["تجنب القيادة الذاتية عند الدوخة أو ألم الصدر أو ضيق النفس.", "الاتصال بالطوارئ أو التوجه لأقرب نقطة إسعاف."]
        : [
            "الراحة وشرب السوائل عند عدم وجود منع طبي.",
            "تجنب تناول أدوية جديدة دون استشارة الطبيب أو الصيدلي.",
            "تدوين القراءات المهمة مثل الحرارة والضغط والسكر إن توفرت."
          ],
    disclaimer
  };
}

function makePrompt(input: CareInsightInput) {
  return `
You are a careful healthcare AI assistant embedded in a local health center system.
Respond in Arabic. Do not provide a final diagnosis. Do not prescribe medication.
Prioritize triage, next steps, clinician questions, and safety red flags.

Center: ${compact(input.centerName)}
User role: ${input.role}
Mode: ${input.context}
Patient age: ${input.patientAge ?? "غير مذكور"}
Gender: ${compact(input.gender)}
Chronic diseases: ${compact(input.chronicDiseases)}
Allergies: ${compact(input.allergies)}
Current medications: ${compact(input.currentMedications)}
User message:
${input.message}

Return only valid JSON with this exact shape:
{
  "urgency": "LOW" | "ROUTINE" | "URGENT" | "EMERGENCY",
  "summary": "Arabic summary",
  "suggestedActions": ["Arabic action"],
  "questionsForClinician": ["Arabic question"],
  "redFlags": ["Arabic red flag"],
  "selfCare": ["Arabic self-care item"],
  "disclaimer": "Arabic safety disclaimer"
}
`;
}

function extractJson(text: string) {
  const withoutFence = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain JSON.");
  }

  return JSON.parse(withoutFence.slice(start, end + 1)) as Record<string, unknown>;
}

function toStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return items.length > 0 ? items.slice(0, 8) : fallback;
}

function toUrgency(value: unknown, fallback: CareInsightResponse["urgency"]) {
  return value === "LOW" || value === "ROUTINE" || value === "URGENT" || value === "EMERGENCY"
    ? value
    : fallback;
}

function normalizeAiPayload(
  payload: Record<string, unknown>,
  fallback: CareInsightResponse,
  source: Exclude<CareInsightResponse["source"], "local-fallback">
): CareInsightResponse {
  return {
    source,
    urgency: toUrgency(payload.urgency, fallback.urgency),
    summary: typeof payload.summary === "string" && payload.summary.trim() ? payload.summary : fallback.summary,
    suggestedActions: toStringArray(payload.suggestedActions, fallback.suggestedActions),
    questionsForClinician: toStringArray(payload.questionsForClinician, fallback.questionsForClinician),
    redFlags: toStringArray(payload.redFlags, fallback.redFlags),
    selfCare: toStringArray(payload.selfCare, fallback.selfCare),
    disclaimer: typeof payload.disclaimer === "string" && payload.disclaimer.trim() ? payload.disclaimer : disclaimer
  };
}

async function generateWithOpenRouter(input: CareInsightInput, fallback: CareInsightResponse) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": env.OPENROUTER_APP_NAME
  };

  if (env.OPENROUTER_APP_URL?.trim()) {
    headers["HTTP-Referer"] = env.OPENROUTER_APP_URL.trim();
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a careful healthcare AI assistant. Respond only with valid JSON matching the requested schema. Do not provide a final diagnosis or prescribe medication."
        },
        {
          role: "user",
          content: makePrompt(input)
        }
      ],
      temperature: 0.25,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    throw new AppError("OpenRouter AI service is currently unavailable. Please try again later.", 503);
  }

  const data = (await response.json()) as OpenRouterResponse;
  const text = data.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new AppError("OpenRouter returned an empty response.", 502);
  }

  try {
    return normalizeAiPayload(extractJson(text), fallback, "openrouter");
  } catch {
    throw new AppError("OpenRouter returned an unreadable response.", 502);
  }
}

async function generateWithGemini(input: CareInsightInput, fallback: CareInsightResponse) {
  const apiKey = env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return fallback;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: makePrompt(input) }]
          }
        ],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 1000,
          responseMimeType: "application/json"
        }
      })
    }
  );

  if (!response.ok) {
    throw new AppError("Gemini AI service is currently unavailable. Please try again later.", 503);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim();

  if (!text) {
    throw new AppError("Gemini returned an empty response.", 502);
  }

  try {
    return normalizeAiPayload(extractJson(text), fallback, "gemini");
  } catch {
    throw new AppError("Gemini returned an unreadable response.", 502);
  }
}

export async function generateCareInsights(input: CareInsightInput): Promise<CareInsightResponse> {
  const fallback = buildLocalResponse(input);
  const provider = env.AI_PROVIDER;

  if (provider === "local") {
    return fallback;
  }

  if (provider === "openrouter") {
    return (await generateWithOpenRouter(input, fallback)) ?? fallback;
  }

  if (provider === "gemini") {
    return generateWithGemini(input, fallback);
  }

  try {
    const openRouterResult = await generateWithOpenRouter(input, fallback);

    if (openRouterResult) {
      return openRouterResult;
    }
  } catch {
    undefined;
  }

  try {
    return await generateWithGemini(input, fallback);
  } catch {
    return fallback;
  }
}

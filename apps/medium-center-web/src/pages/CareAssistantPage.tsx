import { FormEvent, useMemo, useState } from "react";

import { ApiError, apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import {
  AiCareInsightContext,
  AiCareInsightRequest,
  AiCareInsightResponse
} from "../types";

const urgencyLabels: Record<AiCareInsightResponse["urgency"], string> = {
  LOW: "منخفض",
  ROUTINE: "روتيني",
  URGENT: "عاجل",
  EMERGENCY: "طارئ"
};

const urgencyClasses: Record<AiCareInsightResponse["urgency"], string> = {
  LOW: "neutral",
  ROUTINE: "success",
  URGENT: "warning",
  EMERGENCY: "danger"
};

const quickPrompts = [
  "مريض لديه حرارة وصداع منذ يومين مع تعب عام، ما أهم الأسئلة والخطوات التالية؟",
  "ألم صدر مفاجئ مع ضيق نفس وتعرق، كيف يتم التعامل معه داخل المركز؟",
  "مريض سكري لديه دوخة وتعب بعد تأخير وجبة الطعام، ما المعلومات التي يجب توثيقها؟"
];

function readText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(form: FormData, key: string) {
  const value = readText(form, key);
  return value || undefined;
}

function optionalAge(form: FormData) {
  const value = readText(form, "patientAge");

  if (!value) {
    return undefined;
  }

  const age = Number(value);
  return Number.isFinite(age) ? age : undefined;
}

function getAiErrorMessage(cause: unknown) {
  if (
    cause instanceof ApiError &&
    cause.status === 503 &&
    cause.message.toLowerCase().includes("gemini api key")
  ) {
    return "مفتاح Gemini غير مضبوط. أضف GEMINI_API_KEY في ملف .env ثم أعد تشغيل خادم الـAPI.";
  }

  return cause instanceof Error ? cause.message : "تعذر تشغيل المساعد الذكي.";
}

function InsightList({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="section-card inset-card">
      <h3>{title}</h3>
      <div className="stack-list compact">
        {items.map((item) => (
          <div className="stack-item" key={item}>
            {item}
          </div>
        ))}
      </div>
    </article>
  );
}

export function CareAssistantPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AiCareInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const defaultContext = useMemo<AiCareInsightContext>(
    () => (user?.role === "PATIENT" ? "PATIENT_SELF_CARE" : "CLINICAL_TRIAGE"),
    [user?.role]
  );

  async function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const context = readText(form, "context") as AiCareInsightContext;
    const payload: AiCareInsightRequest = {
      message: message.trim(),
      context,
      patientAge: optionalAge(form),
      gender: optionalText(form, "gender"),
      chronicDiseases: optionalText(form, "chronicDiseases"),
      allergies: optionalText(form, "allergies"),
      currentMedications: optionalText(form, "currentMedications")
    };

    try {
      setLoading(true);
      setError("");
      setResult(
        await apiRequest<AiCareInsightResponse>("/ai/care-insights", {
          method: "POST",
          body: JSON.stringify(payload)
        })
      );
    } catch (cause) {
      setError(getAiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">AI care assistant</p>
          <h1>المساعد الذكي للرعاية الصحية</h1>
        </div>
        <p className="muted">
          اكتب الأعراض أو ملاحظات الزيارة للحصول على ملخص أولي، أسئلة متابعة، مؤشرات خطورة، وخطوات عمل مناسبة قبل مراجعة الطبيب.
        </p>
      </section>

      <SectionCard
        title="تحليل حالة أو سؤال صحي"
        subtitle="يستخدم Gemini عند توفر المفتاح، ويعمل بتحليل محلي احتياطي عندما لا يكون GEMINI_API_KEY مضبوطا."
      >
        <form className="form-grid" onSubmit={submitPrompt}>
          <label className="field field-span-2">
            <span>الوصف</span>
            <textarea
              name="message"
              required
              minLength={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="مثال: المريض يشتكي من ألم شديد في الصدر منذ نصف ساعة مع تعرق وضيق نفس..."
            />
          </label>
          <label className="field">
            <span>السياق</span>
            <select name="context" defaultValue={defaultContext}>
              <option value="CLINICAL_TRIAGE">فرز سريري داخل المركز</option>
              <option value="PATIENT_SELF_CARE">إرشاد عام للمريض</option>
              <option value="FOLLOW_UP">متابعة بعد الزيارة</option>
            </select>
          </label>
          <label className="field">
            <span>العمر</span>
            <input name="patientAge" type="number" min="0" max="130" />
          </label>
          <label className="field">
            <span>الجنس</span>
            <input name="gender" placeholder="اختياري" />
          </label>
          <label className="field">
            <span>الأمراض المزمنة</span>
            <input name="chronicDiseases" placeholder="سكري، ضغط، ربو..." />
          </label>
          <label className="field">
            <span>الحساسيات</span>
            <input name="allergies" placeholder="حساسية أدوية أو أطعمة" />
          </label>
          <label className="field">
            <span>الأدوية الحالية</span>
            <input name="currentMedications" placeholder="اختياري" />
          </label>
          <div className="field-span-2 chip-row">
            {quickPrompts.map((prompt) => (
              <button className="ghost-button" type="button" key={prompt} onClick={() => setMessage(prompt)}>
                {prompt.slice(0, 34)}...
              </button>
            ))}
          </div>
          <button className="primary-button" disabled={loading || !message.trim()} type="submit">
            {loading ? "جاري التحليل..." : "تشغيل المساعد"}
          </button>
        </form>
      </SectionCard>

      {error ? <div className="error-banner">{error}</div> : null}

      {result ? (
        <SectionCard
          title="نتيجة المساعد"
          subtitle={result.source === "gemini" ? "تم توليد النتيجة عبر Gemini." : "تم توليد النتيجة عبر التحليل المحلي الاحتياطي."}
          action={<span className={`status-badge ${urgencyClasses[result.urgency]}`}>{urgencyLabels[result.urgency]}</span>}
        >
          <div className="stack-item">
            <strong>الملخص</strong>
            <p>{result.summary}</p>
          </div>
          <div className="split-grid">
            <InsightList title="الخطوات المقترحة" items={result.suggestedActions} />
            <InsightList title="أسئلة للطبيب أو الممرض" items={result.questionsForClinician} />
          </div>
          <div className="split-grid">
            <InsightList title="مؤشرات خطورة" items={result.redFlags} />
            <InsightList title="إرشادات عامة" items={result.selfCare} />
          </div>
          <div className="inline-note">{result.disclaimer}</div>
        </SectionCard>
      ) : null}
    </div>
  );
}

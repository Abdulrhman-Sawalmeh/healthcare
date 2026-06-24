import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";
import { SectionCard } from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { formatDate, joinMeta, toArabicLabel } from "../lib/arabic";

type PatientQrCard = {
  patient: {
    id: number;
    internalId: number;
    unifiedId?: string | null;
    fullName: string;
    nationalId?: string | null;
    phone: string;
    dateOfBirth: string;
    gender: string;
    bloodType?: string | null;
    center: {
      id: number;
      name: string;
      code: string;
      phone?: string | null;
    };
  };
  qrToken: string;
  qrValue: string;
  qrImageUrl: string;
  verificationPath: string;
};

function patientMeta(card: PatientQrCard) {
  return joinMeta([
    card.patient.unifiedId ?? `ملف داخلي ${card.patient.internalId}`,
    card.patient.nationalId ?? "بدون رقم هوية",
    card.patient.phone
  ]);
}

export function PatientQrCardPage() {
  const { user } = useAuth();
  const { patientId, qrToken } = useParams();
  const [card, setCard] = useState<PatientQrCard | null>(null);
  const [manualToken, setManualToken] = useState(qrToken ?? "");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canRegenerate = user?.role === "CENTER_MANAGER" && Boolean(card);
  const cardPath = useMemo(() => {
    if (patientId) return `/center/patients/${encodeURIComponent(patientId)}/card`;
    if (qrToken) return `/center/patients/qr/${encodeURIComponent(qrToken)}`;
    return "";
  }, [patientId, qrToken]);

  const loadCard = useCallback(async () => {
    if (!cardPath) {
      setError("تعذر تحديد بطاقة المريض المطلوبة.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      setCard(await apiRequest<PatientQrCard>(cardPath));
    } catch (cause) {
      setCard(null);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل بطاقة المريض.");
    } finally {
      setLoading(false);
    }
  }, [cardPath]);

  useEffect(() => {
    void loadCard();
  }, [loadCard]);

  async function verifyToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = manualToken.trim();
    if (!token) return;

    try {
      setLoading(true);
      setError("");
      setSuccessMessage("");
      setCard(await apiRequest<PatientQrCard>(`/center/patients/qr/${encodeURIComponent(token)}`));
    } catch (cause) {
      setCard(null);
      setError(cause instanceof Error ? cause.message : "رمز البطاقة غير صالح.");
    } finally {
      setLoading(false);
    }
  }

  async function regenerateQr() {
    if (!card || !window.confirm("سيتم إلغاء الرمز السابق وإصدار رمز جديد. هل تريد المتابعة؟")) {
      return;
    }

    try {
      setRegenerating(true);
      setError("");
      const payload = await apiRequest<PatientQrCard>(`/center/patients/${card.patient.id}/regenerate-qr`, {
        method: "POST"
      });
      setCard(payload);
      setSuccessMessage("تم إصدار رمز جديد. الرمز السابق لم يعد صالحا.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجديد رمز البطاقة.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="page-stack qr-page">
      <div className="profile-toolbar no-print">
        <Link className="action-hint" to={card ? `/patients/${card.patient.id}` : "/patients"}>
          العودة إلى ملف المريض
        </Link>
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => window.print()}>
            طباعة البطاقة
          </button>
          {canRegenerate ? (
            <button className="danger-button" disabled={regenerating} type="button" onClick={() => void regenerateQr()}>
              {regenerating ? "جاري التجديد..." : "تجديد رمز QR"}
            </button>
          ) : null}
        </div>
      </div>

      {successMessage ? <div className="success-banner no-print">{successMessage}</div> : null}
      {error ? <div className="error-banner no-print">{error}</div> : null}
      {loading ? <div className="loading-state">جاري تحميل بطاقة المريض...</div> : null}

      {!loading && card ? (
        <section className="patient-qr-card" aria-label="بطاقة المريض الرقمية">
          <div className="qr-card-main">
            <p className="eyebrow">بطاقة مريض رقمية</p>
            <h1>{card.patient.fullName}</h1>
            <p className="muted">{patientMeta(card)}</p>
            <div className="detail-grid qr-detail-grid">
              <div className="detail-field">
                <span>المركز</span>
                <strong>{card.patient.center.name}</strong>
              </div>
              <div className="detail-field">
                <span>رمز المركز</span>
                <strong>{card.patient.center.code}</strong>
              </div>
              <div className="detail-field">
                <span>رقم الملف الداخلي</span>
                <strong>{card.patient.internalId}</strong>
              </div>
              <div className="detail-field">
                <span>تاريخ الميلاد</span>
                <strong>{formatDate(card.patient.dateOfBirth)}</strong>
              </div>
              <div className="detail-field">
                <span>الجنس</span>
                <strong>{toArabicLabel(card.patient.gender)}</strong>
              </div>
              <div className="detail-field">
                <span>فصيلة الدم</span>
                <strong>{card.patient.bloodType ?? "غير مسجلة"}</strong>
              </div>
            </div>
          </div>

          <aside className="qr-card-code">
            <img alt="رمز QR آمن لفتح ملف المريض" src={card.qrImageUrl} />
            <small>يحتوي الرمز على معرف عشوائي آمن فقط ولا يحتوي على بيانات طبية.</small>
          </aside>
        </section>
      ) : null}

      <div className="no-print">
        <SectionCard title="التحقق من بطاقة QR" subtitle="يمكن إدخال الرمز أو قيمة QR كما هي لفتح بطاقة المريض داخل نفس المركز.">
          <form className="form-grid" onSubmit={verifyToken}>
            <label className="field field-span-2">
              <span>رمز البطاقة</span>
              <input value={manualToken} onChange={(event) => setManualToken(event.target.value)} />
            </label>
            <button className="primary-button" type="submit">
              تحقق من الرمز
            </button>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}

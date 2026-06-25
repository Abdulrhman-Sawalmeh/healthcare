import { useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";

type DemoLoginResponse = {
  success: true;
  loginIdentifier: string;
  demoPassword: string;
  message: string;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

export function DemoPatientLoginButton({ patientId }: { patientId: number }) {
  const { user } = useAuth();
  const [credentials, setCredentials] = useState<DemoLoginResponse | null>(null);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const isAllowed =
    user?.workspace === "center" &&
    (user.role === "RECEPTIONIST" || user.role === "CENTER_MANAGER");

  if (!isAllowed) {
    return null;
  }

  async function prepareCredentials() {
    const confirmed = window.confirm(
      "هذه ميزة تجريبية فقط. سيتم تجهيز كلمة مرور تجريبية لهذا المريض. هل تريد المتابعة؟"
    );

    if (!confirmed) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setCopyMessage("");
      const payload = await apiRequest<DemoLoginResponse>(
        `/center/patients/${patientId}/demo-login`,
        { method: "POST" }
      );
      setCredentials(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز بيانات الدخول التجريبية.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await copyText(value);
      setCopyMessage(`تم نسخ ${label}.`);
    } catch {
      setCopyMessage(`تعذر نسخ ${label}.`);
    }
  }

  return (
    <>
      <button
        className="ghost-button"
        disabled={loading}
        type="button"
        onClick={() => void prepareCredentials()}
      >
        {loading ? "جاري التجهيز..." : "عرض بيانات دخول تجريبية"}
      </button>
      {error ? <span className="demo-login-error">{error}</span> : null}

      {credentials ? (
        <div
          aria-labelledby={`demo-login-title-${patientId}`}
          aria-modal="true"
          className="demo-login-backdrop"
          role="dialog"
          onClick={() => setCredentials(null)}
        >
          <section className="demo-login-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="section-header">
              <div>
                <p className="eyebrow">ميزة محلية للتجربة</p>
                <h3 id={`demo-login-title-${patientId}`}>بيانات دخول المريض التجريبية</h3>
              </div>
              <button className="ghost-button" type="button" onClick={() => setCredentials(null)}>
                إغلاق
              </button>
            </header>

            <div className="demo-login-credential">
              <span>اسم الدخول / رقم الهوية</span>
              <strong dir="ltr">{credentials.loginIdentifier}</strong>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void handleCopy(credentials.loginIdentifier, "اسم الدخول")}
              >
                نسخ اسم الدخول
              </button>
            </div>

            <div className="demo-login-credential">
              <span>كلمة المرور التجريبية</span>
              <strong dir="ltr">{credentials.demoPassword}</strong>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void handleCopy(credentials.demoPassword, "كلمة المرور")}
              >
                نسخ كلمة المرور
              </button>
            </div>

            {copyMessage ? <div className="success-banner">{copyMessage}</div> : null}
            <div className="warning-panel">
              هذه البيانات مخصصة للتجربة فقط ويجب تعطيلها قبل التسليم النهائي.
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

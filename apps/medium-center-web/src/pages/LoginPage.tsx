import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { LoginScene3D } from "../components/LoginScene3D";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { isEnglish, t, toggleLanguage } = useLanguage();
  const [identifier, setIdentifier] = useState(systemConfig.demoAccounts[0].identifier);
  const [password, setPassword] = useState(systemConfig.demoAccounts[0].password);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(identifier, password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-shell">
      <button className="ghost-button language-toggle login-language-toggle" type="button" onClick={toggleLanguage}>
        {isEnglish ? "العربية" : "English"}
      </button>
      <div className="login-panel hero">
        <LoginScene3D />
        <div className="hero-copy">
          <p className="eyebrow">{t(systemConfig.loginEyebrow, "Medium health center")}</p>
          <h1>{t(systemConfig.loginTitle, "Coordinated clinical operations and patient portal")}</h1>
          <p className="muted">{t(systemConfig.loginDescription, "Sign in once and the system opens the right workspace from your registered account.")}</p>
        </div>

        <div className="demo-grid">
          <div className="demo-card">
            <span>{t("توجيه الدخول", "Login routing")}</span>
            <strong>{t("تسجيل دخول موحد وآمن", "One secure sign-in")}</strong>
            <small>
              {t("أدخل البريد أو اسم المستخدم أو الهاتف أو رقم المريض المسجل. يفتح النظام مساحة العمل المناسبة تلقائياً.", "Enter the registered email, username, phone, or patient ID. The system opens the right workspace automatically from the account record.")}
            </small>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setIdentifier(systemConfig.demoAccounts[0].identifier);
              setPassword(systemConfig.demoAccounts[0].password);
            }}
          >
            {t("تعبئة بيانات تجريبية", "Fill demo credentials")}
          </button>
        </div>
      </div>

      <form className="login-panel form-panel" autoComplete="off" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">تسجيل الدخول بحسب النظام</p>
          <h2>افتح الواجهة الصحيحة</h2>
        </div>

        <label className="field">
          <span>اسم المستخدم أو رقم الهوية أو البريد الإلكتروني</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="off"
            type="text"
          />
        </label>

        <label className="field">
          <span>كلمة المرور</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            type="password"
          />
        </label>

        {error ? <div className="error-banner">{error}</div> : null}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? "جارٍ فتح الواجهة..." : "دخول"}
        </button>
      </form>
    </div>
  );
}

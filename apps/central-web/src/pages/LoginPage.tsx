import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, apiRequest } from "../api/client";
import { DemoAccount, systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

const accountArabicLabels: Record<string, string> = {
  CENTRAL_ADMIN: "مدير النظام المركزي"
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(systemConfig.demoAccounts);

  useEffect(() => {
    document.title = "النظام المركزي";
  }, []);

  useEffect(() => {
    apiRequest<DemoAccount[]>("/auth/demo-accounts")
      .then((accounts) => {
        if (accounts.length > 0) {
          setDemoAccounts(accounts);
        }
      })
      .catch(() => undefined);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await login(identifier, password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status !== 401
          ? cause.message
          : "بيانات الدخول غير صحيحة أو لا تنتمي لهذا النظام."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function fillAccount(account: DemoAccount) {
    setIdentifier(account.identifier);
    setPassword(account.password);
    setError("");
  }

  return (
    <div className="login-shell">
      <div className="login-panel hero">
        <div className="login-brand-panel" data-localized="true">
          <p>بوابة الإدارة</p>
          <h1>النظام المركزي</h1>
        </div>
      </div>

      <form className="login-panel form-panel" autoComplete="off" data-localized="true" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">تسجيل الدخول</p>
          <h2>بيانات الحساب</h2>
        </div>

        <label className="field">
          <span>اسم المستخدم أو البريد الإلكتروني</span>
          <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" type="text" />
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

        <div className="demo-login-panel">
          <span>{t("تعبئة حساب تجريبي", "Demo account autofill")}</span>
          <div className="demo-account-list">
            {demoAccounts.map((account) => (
              <button key={account.identifier} className="demo-account-button" type="button" onClick={() => fillAccount(account)}>
                {accountArabicLabels[account.roleLabel] ?? account.roleLabel}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting ? "جاري الدخول..." : "دخول"}
        </button>
      </form>
    </div>
  );
}

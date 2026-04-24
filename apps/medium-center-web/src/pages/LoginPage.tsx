import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
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
      <div className="login-panel hero">
        <div className="hero-copy">
          <p className="eyebrow">{systemConfig.loginEyebrow}</p>
          <h1>{systemConfig.loginTitle}</h1>
          <p className="muted">{systemConfig.loginDescription}</p>
        </div>

        <div className="demo-grid">
          {systemConfig.demoAccounts.map((account) => (
            <button
              key={account.identifier}
              className="demo-card"
              type="button"
              onClick={() => {
                setIdentifier(account.identifier);
                setPassword(account.password);
              }}
            >
              <span>{account.group}</span>
              <strong>{account.roleLabel}</strong>
              <small>{account.identifier}</small>
            </button>
          ))}
        </div>
      </div>

      <form className="login-panel form-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">تسجيل الدخول بحسب النظام</p>
          <h2>افتح الواجهة الصحيحة</h2>
        </div>

        <label className="field">
          <span>اسم المستخدم أو البريد الإلكتروني</span>
          <input
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            type="text"
          />
        </label>

        <label className="field">
          <span>كلمة المرور</span>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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

import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, apiRequest } from "../api/client";
import { DemoAccount, systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { toArabicLabel } from "../lib/arabic";

const accountArabicLabels: Record<string, string> = {
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف استقبال",
  PHARMACIST: "صيدلي",
  LAB_TECH: "فني مختبر",
  "مدير المركز": "مدير المركز",
  "طبيب": "طبيب",
  "مريض": "مريض",
  "موظف استقبال": "موظف استقبال",
  "صيدلي": "صيدلي",
  "فني مختبر": "فني مختبر"
};

type ResetStep = "login" | "request" | "verify" | "reset";

interface PasswordResetVerifyResponse {
  success: boolean;
  resetToken: string;
  resetTokenExpiresAt: string;
}

interface PasswordResetRequestResponse {
  success: boolean;
  deliveryMethod?: "BREVO_API" | "SMTP" | "WEBHOOK" | "OUTBOX" | "SKIPPED";
  message?: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isHiddenDemoAccount(account: DemoAccount) {
  const roleLabel = account.roleLabel.trim();
  const identifier = account.identifier.trim().toLowerCase();

  return roleLabel === "NURSE" || roleLabel === "ممرض" || identifier.includes("nurse");
}

function getLoginFailureMessage(cause: unknown) {
  if (cause instanceof ApiError) {
    return cause.status !== 401
      ? cause.message
      : "بيانات الدخول غير صحيحة أو لا تنتمي إلى هذا النظام.";
  }

  if (cause instanceof TypeError) {
    return "تعذر الاتصال بالخادم. تحقق من تشغيل واجهة API ثم حاول مرة أخرى.";
  }

  if (cause instanceof Error && cause.message === systemConfig.accessDeniedMessage) {
    return cause.message;
  }

  return "بيانات الدخول غير صحيحة أو لا تنتمي إلى هذا النظام.";
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(systemConfig.demoAccounts);
  const [resetStep, setResetStep] = useState<ResetStep>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    document.title = systemConfig.loginTitle;
  }, []);

  useEffect(() => {
    apiRequest<DemoAccount[]>("/auth/demo-accounts")
      .then((accounts) => {
        const visibleAccounts = accounts.filter((account) => !isHiddenDemoAccount(account));

        if (visibleAccounts.length > 0) {
          setDemoAccounts(visibleAccounts);
        }
      })
      .catch(() => undefined);
  }, []);

  const visibleDemoAccounts = demoAccounts.filter((account) => !isHiddenDemoAccount(account));

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setError("أدخل رقم الهوية / اسم الدخول وكلمة المرور.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await login(identifier.trim(), password);
      navigate("/", { replace: true });
    } catch (cause) {
      setError(getLoginFailureMessage(cause));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetRequest() {
    const email = resetEmail.trim();

    if (!isValidEmail(email)) {
      setError("أدخل بريدا إلكترونيا صحيحا مرتبطا بالحساب.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const payload = await apiRequest<PasswordResetRequestResponse>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setResetStep("verify");
      setNotice(payload.message ?? "إذا كان البريد مرتبطا بحساب فعال، تم إرسال كود التحقق إليه.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تعذر إرسال كود التحقق.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetVerify() {
    if (resetCode.trim().length < 4) {
      setError("أدخل رمز التحقق المرسل إلى بريدك.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      const payload = await apiRequest<PasswordResetVerifyResponse>("/auth/password-reset/verify", {
        method: "POST",
        body: JSON.stringify({
          email: resetEmail.trim(),
          code: resetCode.trim()
        })
      });
      setResetToken(payload.resetToken);
      setResetStep("reset");
      setNotice("تم التحقق من الرمز. يمكنك الآن تعيين كلمة مرور جديدة.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "رمز التحقق غير صحيح.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetConfirm() {
    if (!resetToken) {
      setError("تحقق من رمز البريد الإلكتروني أولا.");
      setResetStep("verify");
      return;
    }

    if (newPassword.length < 8) {
      setError("كلمة المرور الجديدة يجب ألا تقل عن 8 خانات.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة المرور غير مطابق.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await apiRequest("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({
          email: resetEmail.trim(),
          resetToken,
          newPassword
        })
      });
      setIdentifier(resetEmail.trim());
      setPassword("");
      setResetCode("");
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setResetStep("login");
      setNotice("تم تغيير كلمة المرور بنجاح. يمكنك تسجيل الدخول الآن.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تعذر تغيير كلمة المرور.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (resetStep === "request") {
      await handlePasswordResetRequest();
      return;
    }

    if (resetStep === "verify") {
      await handlePasswordResetVerify();
      return;
    }

    if (resetStep === "reset") {
      await handlePasswordResetConfirm();
      return;
    }

    await handleLogin();
  }

  function fillAccount(account: DemoAccount) {
    setIdentifier(account.identifier);
    setPassword(account.password);
    setError("");
    setNotice("");
  }

  function startPasswordReset() {
    setResetStep("request");
    setResetEmail(identifier.includes("@") ? identifier : "");
    setResetCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setNotice("");
  }

  function backToLogin() {
    setResetStep("login");
    setError("");
  }

  function resendCode() {
    setResetCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    void handlePasswordResetRequest();
  }

  const heading =
    resetStep === "login"
      ? "بيانات الحساب"
      : resetStep === "request"
        ? "استعادة كلمة المرور"
        : resetStep === "verify"
          ? "تحقق من بريدك الإلكتروني"
          : "إعادة تعيين كلمة المرور";

  return (
    <div className="login-shell">
      <div className="login-panel hero">
        <div className="login-brand-panel" data-localized="true">
          <p>{systemConfig.loginEyebrow}</p>
          <h1>{systemConfig.name}</h1>
        </div>
      </div>

      <form className="login-panel form-panel" autoComplete="off" data-localized="true" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">{resetStep === "login" ? systemConfig.loginEyebrow : "استعادة كلمة المرور"}</p>
          <h2>{heading}</h2>
          {resetStep === "login" ? <p className="muted login-subtitle">{systemConfig.loginDescription}</p> : null}
        </div>

        {resetStep === "login" ? (
          <>
            <label className="field">
              <span>رقم الهوية / اسم الدخول / البريد الإلكتروني</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                placeholder="رقم الهوية أو اسم الدخول"
                type="text"
              />
            </label>

            <label className="field password-field">
              <span>كلمة المرور</span>
              <div className="password-input-wrap">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="كلمة المرور"
                  type={showPassword ? "text" : "password"}
                />
                <button
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className={`password-toggle ${showPassword ? "is-visible" : ""}`}
                  onClick={() => setShowPassword((current) => !current)}
                  type="button"
                >
                  <span aria-hidden="true" className="password-eye" />
                </button>
              </div>
            </label>

            <button className="ghost-button" type="button" onClick={startPasswordReset}>
              هل نسيت كلمة المرور؟
            </button>
          </>
        ) : resetStep === "request" ? (
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              autoComplete="email"
              placeholder="doctor@example.com"
              type="email"
            />
          </label>
        ) : resetStep === "verify" ? (
          <>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input value={resetEmail} readOnly type="email" />
            </label>
            <label className="field">
              <span>رمز التحقق</span>
              <input
                value={resetCode}
                onChange={(event) => setResetCode(event.target.value)}
                inputMode="numeric"
                maxLength={10}
                placeholder="أدخل الرمز"
              />
            </label>
            <button className="ghost-button" disabled={submitting} type="button" onClick={resendCode}>
              إعادة إرسال الكود
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>كلمة السر الجديدة</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="كلمة مرور جديدة"
                type="password"
              />
            </label>
            <label className="field">
              <span>تأكيد كلمة السر الجديدة</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="تأكيد كلمة المرور"
                type="password"
              />
            </label>
          </>
        )}

        {resetStep === "login" ? (
          <div className="demo-login-panel">
            <span>تعبئة حساب تجريبي</span>
            <div className="demo-account-list">
              {visibleDemoAccounts.map((account) => (
                <button key={account.identifier} className="demo-account-button" type="button" onClick={() => fillAccount(account)}>
                  {accountArabicLabels[account.roleLabel] ?? toArabicLabel(account.roleLabel)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {notice ? <div className="success-banner">{notice}</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <button className="primary-button" disabled={submitting} type="submit">
          {submitting
            ? "جاري التنفيذ..."
            : resetStep === "login"
              ? "دخول"
              : resetStep === "request"
                ? "إرسال كود التحقق"
                : resetStep === "verify"
                  ? "تحقق من الرمز"
                  : "إعادة تعيين كلمة المرور"}
        </button>
        {resetStep !== "login" ? (
          <button className="ghost-button" type="button" onClick={backToLogin}>
            العودة لتسجيل الدخول
          </button>
        ) : null}
      </form>
    </div>
  );
}

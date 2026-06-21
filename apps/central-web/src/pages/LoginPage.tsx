import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError, apiRequest } from "../api/client";
import { DemoAccount, systemConfig } from "../config/system";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

const accountArabicLabels: Record<string, string> = {
  CENTRAL_ADMIN: "مدير النظام المركزي",
  CENTER_MANAGER: "مدير المركز",
  DOCTOR: "طبيب",
  PATIENT: "مريض",
  RECEPTIONIST: "موظف الاستقبال"
};

type ResetStep = "login" | "request" | "verify" | "reset";

interface PasswordResetVerifyResponse {
  success: boolean;
  resetToken: string;
  resetTokenExpiresAt: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();
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

  async function handleLogin() {
    setSubmitting(true);
    setError("");
    setNotice("");

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

  async function handlePasswordResetRequest() {
    if (!resetEmail.trim()) {
      setError("أدخل البريد الإلكتروني أولا.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await apiRequest("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({
          email: resetEmail.trim()
        })
      });
      setResetStep("verify");
      setNotice("إذا كان البريد مرتبطا بحساب فعال، تم إرسال كود التحقق إليه.");
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
      setNotice("تم التحقق من الرمز. يمكنك الآن تعيين كلمة سر جديدة.");
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
      setError("كلمة السر الجديدة يجب ألا تقل عن 8 خانات.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("تأكيد كلمة السر غير مطابق.");
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
      setNotice("تم تغيير كلمة السر بنجاح. يمكنك تسجيل الدخول الآن.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "تعذر تغيير كلمة السر.");
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
        ? "استعادة كلمة السر"
        : resetStep === "verify"
          ? "تحقق من بريدك الإلكتروني"
          : "إعادة تعيين كلمة السر";

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
          <p className="eyebrow">{resetStep === "login" ? "تسجيل الدخول" : "استعادة كلمة السر"}</p>
          <h2>{heading}</h2>
        </div>

        {resetStep === "login" ? (
          <>
            <label className="field">
              <span>اسم المستخدم أو رقم الهوية أو البريد الإلكتروني</span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="off"
                placeholder="اسم المستخدم"
                type="text"
              />
            </label>

            <label className="field password-field">
              <span>كلمة المرور</span>
              <div className="password-input-wrap">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
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
              هل نسيت كلمة السر؟
            </button>
          </>
        ) : resetStep === "request" ? (
          <label className="field">
            <span>البريد الإلكتروني</span>
            <input
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              autoComplete="email"
              placeholder="patient@example.com"
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
                placeholder="إعادة تعيين كلمة السر"
                type="password"
              />
            </label>
            <label className="field">
              <span>تأكيد كلمة السر الجديدة</span>
              <input
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="تأكيد كلمة السر"
                type="password"
              />
            </label>
          </>
        )}

        {resetStep === "login" ? (
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
                  : "إعادة تعيين كلمة السر"}
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

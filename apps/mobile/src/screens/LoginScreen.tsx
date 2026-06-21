import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

import { ApiError, apiRequest, getApiUrl } from "../api/client";
import { AppIcon } from "../components/Icon";
import { AppButton, TextField } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing } from "../theme/tokens";

const demoAccounts = [
  { label: "مدير المركز", identifier: "medium-manager" },
  { label: "طبيب", identifier: "medium-doctor" },
  { label: "استقبال", identifier: "medium-receptionist" },
  { label: "تمريض", identifier: "medium-nurse" },
  { label: "مختبر", identifier: "medium-lab" },
  { label: "صيدلية", identifier: "medium-pharmacist" },
  { label: "مريض", identifier: "medium-patient" }
];

type ResetStep = "login" | "request" | "verify" | "reset";

interface PasswordResetVerifyResponse {
  success: boolean;
  resetToken: string;
  resetTokenExpiresAt: string;
}

export function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }

    setSubmitting(true);
    setError("");
    setNotice("");

    try {
      await login(identifier.trim(), password);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  }

  async function requestPasswordReset() {
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
        body: JSON.stringify({ email: resetEmail.trim() })
      });
      setResetStep("verify");
      setNotice("إذا كان البريد مرتبطا بحساب فعال، تم إرسال كود التحقق إليه.");
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "تعذر إرسال كود التحقق.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyResetCode() {
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
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "رمز التحقق غير صحيح.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPasswordReset() {
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
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "تعذر تغيير كلمة السر.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillAccount(account: (typeof demoAccounts)[number]) {
    setIdentifier(account.identifier);
    setPassword("Password123!");
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

  function handlePrimaryAction() {
    if (resetStep === "request") {
      void requestPasswordReset();
      return;
    }

    if (resetStep === "verify") {
      void verifyResetCode();
      return;
    }

    if (resetStep === "reset") {
      void confirmPasswordReset();
      return;
    }

    void handleLogin();
  }

  const title =
    resetStep === "login"
      ? "تسجيل الدخول"
      : resetStep === "request"
        ? "استعادة كلمة السر"
        : resetStep === "verify"
          ? "تحقق من بريدك الإلكتروني"
          : "إعادة تعيين كلمة السر";
  const primaryLabel =
    resetStep === "login"
      ? "دخول"
      : resetStep === "request"
        ? "إرسال كود التحقق"
        : resetStep === "verify"
          ? "تحقق من الرمز"
          : "إعادة تعيين كلمة السر";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.brandIcon}>
            <AppIcon name="medical" color="#fff" size={30} />
          </View>
          <Text style={styles.brandTitle}>المركز الصحي المتوسط</Text>
          <Text style={styles.brandSub}>تطبيق موبايل لإدارة استقبال المركز، الزيارات، المتابعة الطبية وخدمات المريض.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>{title}</Text>

          {resetStep === "login" ? (
            <>
              <TextField
                label="اسم المستخدم أو البريد الإلكتروني"
                onChangeText={setIdentifier}
                placeholder="أدخل بيانات الحساب"
                value={identifier}
              />

              <View style={styles.passwordField}>
                <TextField
                  label="كلمة المرور"
                  onChangeText={setPassword}
                  placeholder="أدخل كلمة المرور"
                  secureTextEntry={!showPassword}
                  inputStyle={styles.passwordInput}
                  value={password}
                />
                <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.passwordIcon}>
                  <AppIcon name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
                </Pressable>
              </View>

              <AppButton label="هل نسيت كلمة السر؟" onPress={startPasswordReset} tone="ghost" />
            </>
          ) : resetStep === "request" ? (
            <TextField
              keyboardType="email-address"
              label="البريد الإلكتروني"
              onChangeText={setResetEmail}
              placeholder="patient@example.com"
              value={resetEmail}
            />
          ) : resetStep === "verify" ? (
            <>
              <TextField
                editable={false}
                keyboardType="email-address"
                label="البريد الإلكتروني"
                onChangeText={setResetEmail}
                value={resetEmail}
              />
              <TextField
                keyboardType="number-pad"
                label="رمز التحقق"
                onChangeText={setResetCode}
                placeholder="أدخل الرمز"
                value={resetCode}
              />
              <AppButton disabled={submitting} label="إعادة إرسال الكود" onPress={() => void requestPasswordReset()} tone="ghost" />
            </>
          ) : (
            <>
              <TextField
                label="كلمة السر الجديدة"
                onChangeText={setNewPassword}
                placeholder="إعادة تعيين كلمة السر"
                secureTextEntry
                value={newPassword}
              />
              <TextField
                label="تأكيد كلمة السر الجديدة"
                onChangeText={setConfirmPassword}
                placeholder="تأكيد كلمة السر"
                secureTextEntry
                value={confirmPassword}
              />
            </>
          )}

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable disabled={submitting} onPress={handlePrimaryAction} style={styles.primaryButton}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}
          </Pressable>

          {resetStep !== "login" ? <AppButton label="العودة لتسجيل الدخول" onPress={backToLogin} tone="ghost" /> : null}

          {resetStep === "login" ? (
            <>
              <Text style={styles.demoTitle}>حسابات التجربة</Text>
              <View style={styles.accounts}>
                {demoAccounts.map((account) => (
                  <AppButton
                    key={account.identifier}
                    label={account.label}
                    onPress={() => fillAccount(account)}
                    style={styles.accountButton}
                    tone="ghost"
                  />
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.server}>الخادم: {getApiUrl()}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.lg
  },
  brand: {
    alignItems: "center",
    gap: spacing.sm
  },
  brandIcon: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center"
  },
  brandTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    textAlign: "center"
  },
  brandSub: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    textAlign: "right"
  },
  passwordField: {
    position: "relative"
  },
  passwordInput: {
    paddingLeft: 52
  },
  passwordIcon: {
    position: "absolute",
    left: 4,
    bottom: 0,
    width: 48,
    height: 50,
    alignItems: "center",
    justifyContent: "center"
  },
  primaryButton: {
    minHeight: 50,
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16
  },
  demoTitle: {
    color: colors.muted,
    fontWeight: "800",
    textAlign: "right",
    marginTop: spacing.sm
  },
  accounts: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  accountButton: {
    minHeight: 40,
    paddingHorizontal: spacing.sm
  },
  server: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.xs
  },
  notice: {
    color: colors.success,
    backgroundColor: "#e8f6ef",
    borderColor: "#b8e3cd",
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "right"
  },
  error: {
    color: colors.danger,
    backgroundColor: "#fdecec",
    borderColor: "#f2c1c1",
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontWeight: "800",
    lineHeight: 20,
    textAlign: "right"
  }
});

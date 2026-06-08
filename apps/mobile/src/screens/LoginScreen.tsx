import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ApiError, getApiUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing } from "../theme/tokens";

const accounts = [
  { label: "مدير المركز", identifier: "medium-manager" },
  { label: "طبيب", identifier: "medium-doctor" },
  { label: "موظف استقبال", identifier: "medium-receptionist" },
  { label: "ممرض", identifier: "medium-nurse" },
  { label: "فني مختبر", identifier: "medium-lab" },
  { label: "صيدلي", identifier: "medium-pharmacist" },
  { label: "مريض", identifier: "medium-patient" }
];

export function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (!identifier.trim() || !password) {
      setError("أدخل اسم المستخدم وكلمة المرور.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await login(identifier.trim(), password);
    } catch (cause) {
      setError(cause instanceof ApiError || cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillAccount(account: typeof accounts[number]) {
    setIdentifier(account.identifier);
    setPassword("Password123!");
    setError("");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.brandIcon}><Ionicons name="medical" color="#fff" size={30} /></View>
          <Text style={styles.brandTitle}>المركز الصحي المتوسط</Text>
          <Text style={styles.brandSub}>الوصول الآمن إلى خدمات المركز ودورة رعاية المريض</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>تسجيل الدخول</Text>
          <Text style={styles.label}>اسم المستخدم أو البريد الإلكتروني</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setIdentifier}
            placeholder="أدخل بيانات الحساب"
            placeholderTextColor={colors.muted}
            style={styles.input}
            textAlign="right"
            value={identifier}
          />
          <Text style={styles.label}>كلمة المرور</Text>
          <View style={styles.passwordRow}>
            <TextInput
              onChangeText={setPassword}
              placeholder="أدخل كلمة المرور"
              placeholderTextColor={colors.muted}
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
              textAlign="right"
              value={password}
            />
            <Pressable onPress={() => setShowPassword((value) => !value)} style={styles.iconButton}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={22} color={colors.muted} />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={submitting} onPress={() => void handleLogin()} style={styles.primaryButton}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>دخول</Text>}
          </Pressable>

          <Text style={styles.demoTitle}>حسابات مرحلة التطوير</Text>
          <View style={styles.accounts}>
            {accounts.map((account) => (
              <Pressable key={account.identifier} onPress={() => fillAccount(account)} style={styles.accountButton}>
                <Text style={styles.accountText}>{account.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.server}>الخادم: {getApiUrl()}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.lg },
  brand: { alignItems: "center", gap: spacing.sm },
  brandIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  brandTitle: { color: colors.text, fontSize: 28, fontWeight: "800", textAlign: "center" },
  brandSub: { color: colors.muted, textAlign: "center", lineHeight: 21 },
  form: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.lg, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "right", marginBottom: spacing.xs },
  label: { color: colors.text, fontWeight: "700", textAlign: "right" },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md, color: colors.text, backgroundColor: "#fff" },
  passwordRow: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: "#fff" },
  passwordInput: { flex: 1, padding: spacing.md, color: colors.text },
  iconButton: { width: 48, alignItems: "center", justifyContent: "center" },
  primaryButton: { minHeight: 50, backgroundColor: colors.primary, borderRadius: radii.sm, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  demoTitle: { color: colors.muted, fontWeight: "700", textAlign: "right", marginTop: spacing.sm },
  accounts: { flexDirection: "row-reverse", flexWrap: "wrap", gap: spacing.xs },
  accountButton: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, paddingHorizontal: spacing.sm, paddingVertical: 9 },
  accountText: { color: colors.primary, fontWeight: "700" },
  server: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.xs },
  error: { color: colors.danger, fontWeight: "700", textAlign: "right" }
});

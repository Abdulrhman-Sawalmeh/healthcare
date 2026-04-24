import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, radii, spacing } from "../theme/tokens";

const accounts = [
  { label: "Admin", email: "admin@healthcare.local", password: "Password123!" },
  { label: "Doctor", email: "doctor@healthcare.local", password: "Password123!" },
  { label: "Patient", email: "patient@healthcare.local", password: "Password123!" }
];

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState(accounts[2].email);
  const [password, setPassword] = useState(accounts[2].password);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError("");

    try {
      await login(email, password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Healthcare Ecosystem</Text>
        <Text style={styles.title}>Keep care plans, referrals, and patient follow-up in one mobile flow.</Text>
        <Text style={styles.subtitle}>
          Sign in with one of the demo accounts to review appointments, alerts, and secure messages.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Sign in</Text>

        <TextInput
          autoCapitalize="none"
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        <TextInput
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={handleLogin} style={styles.primaryButton}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enter mobile workspace</Text>}
        </Pressable>

        <View style={styles.accountList}>
          {accounts.map((account) => (
            <Pressable
              key={account.label}
              onPress={() => {
                setEmail(account.email);
                setPassword(account.password);
              }}
              style={styles.accountChip}
            >
              <Text style={styles.accountLabel}>{account.label}</Text>
              <Text style={styles.accountEmail}>{account.email}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
    gap: spacing.lg
  },
  hero: {
    gap: spacing.sm
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    backgroundColor: "#fff"
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800"
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  },
  accountList: {
    gap: spacing.sm
  },
  accountChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    padding: spacing.md
  },
  accountLabel: {
    color: colors.primary,
    fontWeight: "800",
    marginBottom: 4
  },
  accountEmail: {
    color: colors.text
  }
});

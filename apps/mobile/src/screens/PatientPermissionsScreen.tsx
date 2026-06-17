import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  Card,
  ChipRow,
  ChoiceChip,
  EmptyState,
  HeaderCard,
  LoadingState,
  Notice,
  Screen,
  SectionTitle,
  StatusPill,
  TextField
} from "../components/ui";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { mediumApi } from "../services/mediumApi";
import {
  ConsentTargetOption,
  ConsentTargetsBundle,
  PatientConsentRecord,
  PatientConsentScope,
  PatientConsentTargetType
} from "../types";
import { colors, spacing } from "../theme/tokens";

const scopeOptions: Array<{ value: PatientConsentScope; label: string }> = [
  { value: "BASIC_INFO", label: "Basic info" },
  { value: "VISITS", label: "Visits" },
  { value: "LAB_RESULTS", label: "Lab results" },
  { value: "PRESCRIPTIONS", label: "Prescriptions" },
  { value: "FULL_SUMMARY", label: "Full summary" }
];

export function PatientPermissionsScreen() {
  const [targets, setTargets] = useState<ConsentTargetsBundle>({ centers: [], doctors: [] });
  const [consents, setConsents] = useState<PatientConsentRecord[]>([]);
  const [targetType, setTargetType] = useState<PatientConsentTargetType>("DOCTOR");
  const [targetId, setTargetId] = useState("");
  const [scope, setScope] = useState<PatientConsentScope>("FULL_SUMMARY");
  const [durationDays, setDurationDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const targetOptions = useMemo(
    () => (targetType === "DOCTOR" ? targets.doctors : targets.centers),
    [targetType, targets]
  );

  const loadData = useCallback(async () => {
    setRefreshing(true);

    try {
      const [targetPayload, consentPayload] = await Promise.all([
        mediumApi.portalConsentTargets(),
        mediumApi.portalConsents()
      ]);
      setTargets(targetPayload);
      setConsents(consentPayload);
      setError("");

      const options = targetType === "DOCTOR" ? targetPayload.doctors : targetPayload.centers;
      if (!targetId && options[0]) {
        setTargetId(options[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load data permissions.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [targetId, targetType]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function selectTargetType(nextType: PatientConsentTargetType) {
    setTargetType(nextType);
    const options = nextType === "DOCTOR" ? targets.doctors : targets.centers;
    setTargetId(options[0]?.id ?? "");
  }

  async function createConsent() {
    const days = Number(durationDays);

    if (!targetId) {
      setError("Choose who can access your data.");
      return;
    }

    if (!Number.isFinite(days) || days <= 0 || days > 90) {
      setError("Access duration must be between 1 and 90 days.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      setMessage("");
      await mediumApi.createPortalConsent({
        targetType,
        targetId,
        scope,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
      });
      setMessage("Data permission was granted.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to grant data permission.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeConsent(consentId: number) {
    try {
      setRevokingId(consentId);
      setError("");
      setMessage("");
      await mediumApi.revokePortalConsent(consentId);
      setMessage("Data permission was revoked.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to revoke data permission.");
    } finally {
      setRevokingId(null);
    }
  }

  if (loading) {
    return <LoadingState text="Loading data permissions..." />;
  }

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="Privacy"
        icon="shield-checkmark-outline"
        subtitle="Grant temporary access to your medical record and revoke it whenever needed."
        title="My Data Permissions"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      <Card>
        <SectionTitle title="Grant access" subtitle="Access expires automatically and can be revoked at any time." />
        <ChipRow>
          <ChoiceChip label="Doctor" onPress={() => selectTargetType("DOCTOR")} selected={targetType === "DOCTOR"} />
          <ChoiceChip label="Center" onPress={() => selectTargetType("CENTER")} selected={targetType === "CENTER"} />
        </ChipRow>

        <Text style={styles.label}>Access target</Text>
        <View style={styles.targetList}>
          {targetOptions.slice(0, 12).map((target: ConsentTargetOption) => (
            <ChoiceChip
              key={target.id}
              label={target.label}
              onPress={() => setTargetId(target.id)}
              selected={targetId === target.id}
            />
          ))}
        </View>
        {targetOptions.length === 0 ? <EmptyState text="No available targets were found." /> : null}

        <Text style={styles.label}>Scope</Text>
        <ChipRow>
          {scopeOptions.map((item) => (
            <ChoiceChip key={item.value} label={item.label} onPress={() => setScope(item.value)} selected={scope === item.value} />
          ))}
        </ChipRow>

        <TextField
          keyboardType="numeric"
          label="Duration in days"
          onChangeText={setDurationDays}
          value={durationDays}
        />
        <AppButton disabled={busy || !targetId} icon="shield-checkmark-outline" label="Grant Access" onPress={() => void createConsent()} />
      </Card>

      <Card>
        <SectionTitle title="Active permissions" subtitle="Only currently active, non-expired permissions are shown." />
        {consents.map((consent) => (
          <View key={consent.id} style={styles.listItem}>
            <View style={styles.itemTop}>
              <StatusPill label={toArabicLabel(consent.status)} />
              <Text style={styles.itemTitle}>{consent.targetLabel ?? consent.targetId}</Text>
            </View>
            <Text style={styles.meta}>
              {consent.targetType} | {consent.scope}
            </Text>
            <Text style={styles.meta}>Expires: {formatDateTime(consent.expiresAt)}</Text>
            <AppButton
              disabled={revokingId === consent.id}
              icon="close-circle-outline"
              label="Revoke"
              onPress={() => void revokeConsent(consent.id)}
              tone="danger"
              style={styles.smallAction}
            />
          </View>
        ))}
        {consents.length === 0 ? <EmptyState text="No active data permissions." /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  targetList: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  itemTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 22
  },
  meta: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  smallAction: {
    alignSelf: "center",
    paddingHorizontal: spacing.md
  }
});

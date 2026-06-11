import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle
} from "react-native";

import { AppIcon, IconName } from "./Icon";
import { colors, radii, spacing } from "../theme/tokens";

export function Screen({
  children,
  refreshing,
  onRefresh,
  keyboard = false,
  style
}: {
  children: any;
  refreshing?: boolean;
  onRefresh?: () => void;
  keyboard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, style]}
      keyboardShouldPersistTaps={keyboard ? "handled" : "never"}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined
      }
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function HeaderCard({
  eyebrow,
  title,
  subtitle,
  icon
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.headerCard}>
      {icon ? (
        <View style={styles.headerIcon}>
          <AppIcon name={icon} size={24} color="#fff" />
        </View>
      ) : null}
      <View style={styles.headerTextWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function Card({
  children,
  style
}: {
  children: any;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  title,
  subtitle
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionTitleWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function AppButton({
  label,
  icon,
  onPress,
  disabled,
  tone = "primary",
  style
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger" | "ghost";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "secondary" && styles.secondaryButton,
        tone === "danger" && styles.dangerButton,
        tone === "ghost" && styles.ghostButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style
      ]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={18}
          color={tone === "ghost" ? colors.primary : tone === "danger" ? colors.danger : "#fff"}
        />
      ) : null}
      <Text
        style={[
          styles.buttonText,
          tone === "ghost" && styles.ghostButtonText,
          tone === "danger" && styles.dangerButtonText
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  style,
  inputStyle
}: {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.fieldWrap, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secureTextEntry}
        style={[styles.input, multiline && styles.textarea, inputStyle]}
        textAlign="right"
        textAlignVertical={multiline ? "top" : "center"}
        value={value}
      />
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  icon
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}>
      {icon ? <AppIcon name={icon} size={16} color={selected ? "#fff" : colors.primary} /> : null}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: any }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function StatusPill({ label, tone = "primary" }: { label: string; tone?: "primary" | "warning" | "danger" }) {
  return (
    <View style={[styles.statusPill, tone === "warning" && styles.warningPill, tone === "danger" && styles.dangerPill]}>
      <Text style={[styles.statusText, tone === "danger" && styles.dangerPillText]}>{label}</Text>
    </View>
  );
}

export function Notice({
  text,
  tone = "info"
}: {
  text: string;
  tone?: "info" | "success" | "error";
}) {
  return (
    <View style={[styles.notice, tone === "success" && styles.successNotice, tone === "error" && styles.errorNotice]}>
      <Text style={[styles.noticeText, tone === "error" && styles.errorText]}>{text}</Text>
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function LoadingState({ text = "جار التحميل..." }: { text?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value === null || value === undefined || value === "" ? "غير مسجل" : value}</Text>
    </View>
  );
}

export function ServiceTile({
  title,
  subtitle,
  icon,
  onPress,
  badge
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.serviceTile, pressed && styles.pressed]}>
      <View style={styles.serviceIcon}>
        <AppIcon name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.serviceText}>
        <Text style={styles.serviceTitle}>{title}</Text>
        <Text style={styles.serviceSubtitle}>{subtitle}</Text>
      </View>
      {badge ? <StatusPill label={badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: spacing.lg,
    gap: spacing.md
  },
  headerCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    padding: spacing.lg,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center"
  },
  headerTextWrap: {
    flex: 1,
    gap: 4
  },
  eyebrow: {
    color: "#cfeee5",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right"
  },
  headerTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "right",
    lineHeight: 32
  },
  headerSubtitle: {
    color: "#e6f7f1",
    textAlign: "right",
    lineHeight: 21
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm
  },
  sectionTitleWrap: {
    gap: 4
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "right"
  },
  sectionSubtitle: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21
  },
  button: {
    minHeight: 50,
    borderRadius: radii.sm,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row-reverse",
    gap: spacing.xs,
    paddingHorizontal: spacing.md
  },
  secondaryButton: {
    backgroundColor: colors.secondary
  },
  dangerButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#f0c5c5"
  },
  ghostButton: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  buttonText: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center"
  },
  ghostButtonText: {
    color: colors.primary
  },
  dangerButtonText: {
    color: colors.danger
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    opacity: 0.82
  },
  fieldWrap: {
    gap: spacing.xs
  },
  label: {
    color: colors.text,
    fontWeight: "800",
    textAlign: "right"
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: "#fff"
  },
  textarea: {
    minHeight: 104,
    paddingTop: spacing.md
  },
  chipRow: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: spacing.xs
  },
  choice: {
    minHeight: 40,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: "#fff"
  },
  choiceSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  choiceText: {
    color: colors.text,
    fontWeight: "800"
  },
  choiceTextSelected: {
    color: "#fff"
  },
  statusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6
  },
  warningPill: {
    backgroundColor: "#fff3df"
  },
  dangerPill: {
    backgroundColor: "#fdecec"
  },
  statusText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900"
  },
  dangerPillText: {
    color: colors.danger
  },
  notice: {
    borderRadius: radii.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  successNotice: {
    backgroundColor: "#e8f6ef",
    borderColor: "#b8e3cd"
  },
  errorNotice: {
    backgroundColor: "#fdecec",
    borderColor: "#f2c1c1"
  },
  noticeText: {
    color: colors.text,
    fontWeight: "800",
    textAlign: "right",
    lineHeight: 20
  },
  errorText: {
    color: colors.danger
  },
  empty: {
    minHeight: 86,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 22,
    fontWeight: "700"
  },
  loading: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm
  },
  loadingText: {
    color: colors.muted,
    fontWeight: "700"
  },
  detailRow: {
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    gap: 4
  },
  detailLabel: {
    color: colors.muted,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "700"
  },
  detailValue: {
    color: colors.text,
    textAlign: "right",
    fontWeight: "900",
    lineHeight: 21
  },
  serviceTile: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: spacing.md
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  serviceText: {
    flex: 1,
    gap: 3
  },
  serviceTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "right"
  },
  serviceSubtitle: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 20
  }
});

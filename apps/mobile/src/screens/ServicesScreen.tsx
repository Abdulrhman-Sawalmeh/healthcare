import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconName } from "../components/Icon";
import { AppButton, HeaderCard, Screen, ServiceTile } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import {
  canUseCenterNotifications,
  canUseCenterReferrals,
  canUseMessages,
  canUseVisitWorkflow
} from "../services/mediumApi";
import { colors, spacing } from "../theme/tokens";
import { AiAssistantScreen } from "./AiAssistantScreen";
import { DoctorsScreen } from "./DoctorsScreen";
import { MedicalRecordScreen } from "./MedicalRecordScreen";
import { MessagesScreen } from "./MessagesScreen";
import { NotificationsScreen } from "./NotificationsScreen";
import { PatientPermissionsScreen } from "./PatientPermissionsScreen";
import { PrescriptionVerificationScreen } from "./PrescriptionVerificationScreen";
import { ProfileScreen } from "./ProfileScreen";
import { ReferralsScreen } from "./ReferralsScreen";
import { VisitsScreen } from "./VisitsScreen";

type FeatureKey =
  | "doctors"
  | "medical-record"
  | "messages"
  | "visits"
  | "referrals"
  | "notifications"
  | "permissions"
  | "prescription-verification"
  | "ai-assistant"
  | "profile";

interface FeatureItem {
  key: FeatureKey;
  title: string;
  subtitle: string;
  icon: IconName;
  badge?: string;
}

export function ServicesScreen() {
  const { user } = useAuth();
  const [feature, setFeature] = useState<FeatureKey | null>(null);

  const features = useMemo<FeatureItem[]>(() => {
    if (!user) return [];

    if (user.role === "PATIENT") {
      return [
        { key: "permissions", title: "My Data Permissions", subtitle: "Grant or revoke temporary record access", icon: "shield-checkmark-outline" },
        { key: "doctors", title: "الأطباء", subtitle: "دليل الأطباء ومواعيدهم المقترحة", icon: "medkit-outline" },
        { key: "medical-record", title: "السجل الصحي", subtitle: "التقارير، الإحالات، والاشتراكات", icon: "folder-open-outline" },
        { key: "notifications", title: "الإشعارات", subtitle: "مستجدات المواعيد والتقارير", icon: "notifications-outline" },
        { key: "ai-assistant", title: "المساعد الذكي", subtitle: "إرشاد صحي وأسئلة متابعة", icon: "sparkles-outline" },
        { key: "profile", title: "الحساب", subtitle: "بيانات الدخول والمركز", icon: "person-outline" }
      ];
    }

    const staffFeatures: FeatureItem[] = [];

    if (user.role === "CENTER_MANAGER" || user.role === "DOCTOR" || user.role === "RECEPTIONIST") {
      staffFeatures.push({ key: "doctors", title: "الأطباء", subtitle: "قائمة الأطباء وحساباتهم", icon: "medkit-outline" });
    }

    if (user.role === "CENTER_MANAGER" || user.role === "DOCTOR" || user.role === "RECEPTIONIST") {
      staffFeatures.push({ key: "visits", title: "الزيارات", subtitle: "سجل الزيارات والوصفات والتقارير", icon: "clipboard-outline" });
    }

    if (canUseCenterReferrals(user.role)) {
      staffFeatures.push({ key: "referrals", title: "الإحالات", subtitle: "طلبات الإحالة الصادرة والواردة", icon: "git-branch-outline" });
    }

    staffFeatures.push({
      key: "prescription-verification",
      title: "التحقق من الوصفات",
      subtitle: "مطابقة رمز الوصفة مع سجلات المركز",
      icon: "shield-checkmark-outline"
    });

    if (canUseCenterNotifications(user.role)) {
      staffFeatures.push({ key: "notifications", title: "الإشعارات", subtitle: "طابور التنبيهات والمزامنة", icon: "notifications-outline" });
    }

    if (canUseMessages(user.role)) {
      staffFeatures.push({ key: "messages", title: "المحادثات", subtitle: "تواصل الطبيب مع المرضى", icon: "chatbubble-outline" });
    }

    staffFeatures.push({ key: "ai-assistant", title: "المساعد الذكي", subtitle: "فرز سريري وأسئلة متابعة", icon: "sparkles-outline" });
    staffFeatures.push({ key: "profile", title: "الحساب", subtitle: "بيانات المستخدم والمركز", icon: "person-outline" });

    if (canUseVisitWorkflow(user.role) && staffFeatures[0]?.key === "doctors") {
      staffFeatures[0] = {
        ...staffFeatures[0],
        badge: "مركز متوسط"
      };
    }

    return staffFeatures;
  }, [user]);

  if (feature) {
    return (
      <View style={styles.featureWrap}>
        <View style={styles.backBar}>
          <AppButton icon="arrow-forward-outline" label="العودة للخدمات" onPress={() => setFeature(null)} tone="ghost" />
        </View>
        {renderFeature(feature, setFeature)}
      </View>
    );
  }

  return (
    <Screen>
      <HeaderCard
        eyebrow="الخدمات"
        icon="grid-outline"
        subtitle="الوحدات المتاحة حسب صلاحية حسابك في المركز المتوسط."
        title="خدمات المركز"
      />
      <View style={styles.serviceStack}>
        {features.map((item) => (
          <ServiceTile
            key={item.key}
            badge={item.badge}
            icon={item.icon}
            onPress={() => setFeature(item.key)}
            subtitle={item.subtitle}
            title={item.title}
          />
        ))}
      </View>
      <Text style={styles.footerNote}>التطبيق يعرض وحدات المركز الصحي المتوسط فقط، ولا يفتح شاشات النظام المركزي أو المركز الصغير.</Text>
    </Screen>
  );
}

function renderFeature(feature: FeatureKey, setFeature?: (feature: FeatureKey | null) => void) {
  switch (feature) {
    case "doctors":
      return <DoctorsScreen />;
    case "medical-record":
      return <MedicalRecordScreen />;
    case "messages":
      return <MessagesScreen />;
    case "visits":
      return <VisitsScreen />;
    case "referrals":
      return <ReferralsScreen />;
    case "notifications":
      return <NotificationsScreen onOpenMedicalRecord={() => setFeature?.("medical-record")} />;
    case "permissions":
      return <PatientPermissionsScreen />;
    case "prescription-verification":
      return <PrescriptionVerificationScreen />;
    case "ai-assistant":
      return <AiAssistantScreen />;
    case "profile":
      return <ProfileScreen />;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  featureWrap: {
    flex: 1,
    backgroundColor: colors.background
  },
  backBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.background
  },
  serviceStack: {
    gap: spacing.sm
  },
  footerNote: {
    color: colors.muted,
    textAlign: "right",
    lineHeight: 21,
    fontWeight: "700"
  }
});

import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  AppButton,
  Card,
  EmptyState,
  HeaderCard,
  LoadingState,
  Notice,
  Screen,
  SectionTitle,
  StatusPill
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatDateTime, toArabicLabel } from "../lib/arabic";
import { canUseCenterNotifications, mediumApi } from "../services/mediumApi";
import { CenterNotificationsBundle, NotificationRecord } from "../types";
import { colors, spacing } from "../theme/tokens";

export function NotificationsScreen() {
  const { user } = useAuth();
  const [portalNotifications, setPortalNotifications] = useState<NotificationRecord[]>([]);
  const [centerBundle, setCenterBundle] = useState<CenterNotificationsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isPatient = user?.role === "PATIENT";
  const canUseCenter = canUseCenterNotifications(user?.role);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isPatient) {
        setPortalNotifications(await mediumApi.portalNotifications());
      } else if (canUseCenter) {
        setCenterBundle(await mediumApi.centerNotifications());
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الإشعارات.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [canUseCenter, isPatient]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function markRead(notificationId: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mediumApi.markPortalNotificationRead(notificationId);
      setMessage("تم تعليم الإشعار كمقروء.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحديث الإشعار.");
    } finally {
      setBusy(false);
    }
  }

  async function processQueue() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mediumApi.processCenterNotifications();
      setMessage("تمت معالجة طابور الإشعارات ومزامنة الزيارات.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر معالجة الإشعارات.");
    } finally {
      setBusy(false);
    }
  }

  async function retryNotification(notificationId: number) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await mediumApi.retryCenterNotification(notificationId);
      setMessage("تمت إعادة محاولة إرسال الإشعار.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إعادة المحاولة.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState text="جار تحميل الإشعارات..." />;
  }

  if (!isPatient && !canUseCenter) {
    return (
      <Screen>
        <HeaderCard eyebrow="الإشعارات" icon="notifications-outline" title="إشعارات المركز" />
        <EmptyState text="إشعارات المركز التفصيلية متاحة لمدير المركز والطبيب والاستقبال فقط." />
      </Screen>
    );
  }

  return (
    <Screen refreshing={refreshing} onRefresh={() => void loadData()}>
      <HeaderCard
        eyebrow="المستجدات"
        icon="notifications-outline"
        subtitle={isPatient ? "إشعارات حسابك ومواعيدك وتقاريرك." : "طابور الإشعارات والتنبيهات التشغيلية للمركز."}
        title="الإشعارات"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      {isPatient ? (
        <Card>
          <SectionTitle title="إشعاراتي" />
          {portalNotifications.map((notification) => (
            <View key={notification.id} style={styles.item}>
              <View style={styles.itemTop}>
                <StatusPill label={notification.isRead ? "مقروء" : "جديد"} tone={notification.isRead ? "primary" : "warning"} />
                <Text style={styles.title}>{notification.title}</Text>
              </View>
              <Text style={styles.meta}>{notification.body}</Text>
              <Text style={styles.dateText}>{formatDateTime(notification.createdAt)}</Text>
              {!notification.isRead ? (
                <AppButton disabled={busy} label="تعليم كمقروء" onPress={() => void markRead(notification.id)} tone="ghost" />
              ) : null}
            </View>
          ))}
          {portalNotifications.length === 0 ? <EmptyState text="لا توجد إشعارات حاليا." /> : null}
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle title="تنبيهات المركز" />
            {(centerBundle?.alerts ?? []).map((alert) => (
              <View key={alert.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(alert.severity)} tone={alert.severity === "HIGH" ? "danger" : "warning"} />
                  <Text style={styles.title}>{alert.title}</Text>
                </View>
                <Text style={styles.meta}>{alert.message}</Text>
                <Text style={styles.dateText}>{formatDateTime(alert.createdAt)}</Text>
              </View>
            ))}
            {(centerBundle?.alerts ?? []).length === 0 ? <EmptyState text="لا توجد تنبيهات تشغيلية حاليا." /> : null}
          </Card>

          <Card>
            <SectionTitle title="الإشعارات الصادرة" subtitle="رسائل تنتظر الإرسال أو فشلت وتحتاج متابعة." />
            <AppButton disabled={busy} icon="sync-outline" label="معالجة الطابور الآن" onPress={() => void processQueue()} />
            {(centerBundle?.outgoing ?? []).map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(item.status)} tone={item.status === "FAILED" ? "danger" : "primary"} />
                  <Text style={styles.title}>{toArabicLabel(item.notificationType)}</Text>
                </View>
                <Text style={styles.meta}>محاولات: {item.retryCount}/{item.maxRetries}</Text>
                {item.lastError ? <Text style={styles.errorText}>{item.lastError}</Text> : null}
                <Text style={styles.dateText}>{formatDateTime(item.createdAt)}</Text>
                {item.status === "FAILED" ? (
                  <AppButton disabled={busy} label="إعادة المحاولة" onPress={() => void retryNotification(item.id)} tone="ghost" />
                ) : null}
              </View>
            ))}
            {(centerBundle?.outgoing ?? []).length === 0 ? <EmptyState text="لا توجد إشعارات صادرة معلقة." /> : null}
          </Card>

          <Card>
            <SectionTitle title="الإشعارات الواردة" />
            {(centerBundle?.incoming ?? []).map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemTop}>
                  <StatusPill label={toArabicLabel(item.status)} />
                  <Text style={styles.title}>{toArabicLabel(item.notificationType)}</Text>
                </View>
                {item.responseError ? <Text style={styles.errorText}>{item.responseError}</Text> : null}
                <Text style={styles.dateText}>{formatDateTime(item.receivedAt)}</Text>
              </View>
            ))}
            {(centerBundle?.incoming ?? []).length === 0 ? <EmptyState text="لا توجد إشعارات واردة حاليا." /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
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
  title: {
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
  dateText: {
    color: colors.primary,
    textAlign: "right",
    fontSize: 12,
    fontWeight: "800"
  },
  errorText: {
    color: colors.danger,
    textAlign: "right",
    fontWeight: "800"
  }
});

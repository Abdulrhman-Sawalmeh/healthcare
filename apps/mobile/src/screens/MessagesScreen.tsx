import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "../components/Icon";
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
  TextField
} from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/arabic";
import {
  attachmentDataUri,
  blobToMessageAttachment,
  formatFileSize,
  getAttachmentKind,
  pickMessageAttachment,
  startNativeAudioRecording,
  stopNativeAudioRecording
} from "../lib/messageAttachments";
import { mediumApi } from "../services/mediumApi";
import { ConversationPatientOption, MessageAttachmentDraft, PortalDoctorRecord, ThreadRecord } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

type WebRecorder = {
  state?: string;
  mimeType?: string;
  ondataavailable: null | ((event: { data?: unknown }) => void);
  onstop: null | (() => void);
  start: () => void;
  stop: () => void;
};

type WebStream = {
  getTracks: () => Array<{ stop: () => void }>;
};

export function MessagesScreen() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [patients, setPatients] = useState<ConversationPatientOption[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<MessageAttachmentDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const webMediaRecorderRef = useRef<WebRecorder | null>(null);
  const webRecordingStreamRef = useRef<WebStream | null>(null);
  const recordingChunksRef = useRef<unknown[]>([]);
  const nativeRecordingRef = useRef<unknown>(null);

  const isPatient = user?.role === "PATIENT";
  const isDoctor = user?.role === "DOCTOR";

  const loadData = useCallback(async () => {
    if (!isPatient && !isDoctor) {
      setLoading(false);
      return;
    }

    try {
      const requests = [
        mediumApi.threads(),
        isPatient ? mediumApi.portalDoctors() : Promise.resolve<PortalDoctorRecord[]>([]),
        isDoctor ? mediumApi.conversationPatients() : Promise.resolve<ConversationPatientOption[]>([])
      ] as const;
      const [threadsPayload, doctorsPayload, patientsPayload] = await Promise.all(requests);

      setThreads(threadsPayload);
      setDoctors(doctorsPayload);
      setPatients(patientsPayload);
      setError("");

      if (!selectedThreadId && threadsPayload[0]) {
        setSelectedThreadId(threadsPayload[0].id);
      }
      if (!selectedDoctorId && doctorsPayload[0]) {
        setSelectedDoctorId(doctorsPayload[0].id);
      }
      if (!selectedPatientId && patientsPayload[0]) {
        setSelectedPatientId(patientsPayload[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل المحادثات.");
    } finally {
      setLoading(false);
    }
  }, [isDoctor, isPatient, selectedDoctorId, selectedPatientId, selectedThreadId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      const recorder = webMediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          undefined;
        }
      }
      stopWebRecordingTracks();

      const nativeRecording = nativeRecordingRef.current as { stopAndUnloadAsync?: () => Promise<void> } | null;
      void nativeRecording?.stopAndUnloadAsync?.().catch(() => undefined);
    };
  }, []);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? threads[0],
    [threads, selectedThreadId]
  );
  const selectedThreadClosed = selectedThread?.status === "CLOSED";

  useEffect(() => {
    if (selectedThread) {
      void mediumApi.markThreadRead(selectedThread.id).catch(() => undefined);
    }
  }, [selectedThread?.id]);

  const canSend = Boolean(selectedThread && !selectedThreadClosed && (draft.trim() || attachment) && !isRecording);

  async function startThread() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const thread = await mediumApi.createThread({
        doctorId: isPatient ? selectedDoctorId : undefined,
        patientId: isDoctor ? selectedPatientId : undefined
      });
      setSelectedThreadId(thread.id);
      setMessage("تم فتح المحادثة. يمكنك إرسال أول رسالة الآن.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح المحادثة.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!selectedThread || (!draft.trim() && !attachment)) return;

    if (selectedThreadClosed) {
      setError("هذه المحادثة مغلقة. أعد فتحها قبل إرسال رسالة جديدة.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const updated = await mediumApi.sendMessage(selectedThread.id, draft.trim(), attachment);
      setDraft("");
      setAttachment(null);
      setThreads((current) => current.map((thread) => (thread.id === updated.id ? updated : thread)));
      setSelectedThreadId(updated.id);
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleThreadStatus() {
    if (!selectedThread) return;

    const nextStatus = selectedThreadClosed ? "OPEN" : "CLOSED";
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const updated = await mediumApi.updateThreadStatus(selectedThread.id, nextStatus);
      if (nextStatus === "CLOSED") {
        setDraft("");
        setAttachment(null);
      }
      setThreads((current) => current.map((thread) => (thread.id === updated.id ? updated : thread)));
      setSelectedThreadId(updated.id);
      setMessage(nextStatus === "CLOSED" ? "تم إغلاق المحادثة." : "تمت إعادة فتح المحادثة.");
      await loadData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تغيير حالة المحادثة.");
    } finally {
      setBusy(false);
    }
  }

  async function chooseAttachment() {
    if (selectedThreadClosed) {
      setError("هذه المحادثة مغلقة. أعد فتحها قبل إرفاق ملف.");
      return;
    }

    setError("");
    setMessage("");

    try {
      const nextAttachment = await pickMessageAttachment();
      if (nextAttachment) {
        setAttachment(nextAttachment);
        setMessage("تم تجهيز الملف للإرسال.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرفاق الملف.");
    }
  }

  async function startRecording() {
    if (selectedThreadClosed) {
      setError("هذه المحادثة مغلقة. أعد فتحها قبل إرسال تسجيل صوتي.");
      return;
    }

    setError("");
    setMessage("");
    setRecordingBusy(true);

    try {
      if (Platform.OS === "web") {
        const navigatorRef = (globalThis as Record<string, unknown>).navigator as
          | { mediaDevices?: { getUserMedia: (constraints: Record<string, unknown>) => Promise<WebStream> } }
          | undefined;
        const MediaRecorderCtor = (globalThis as Record<string, unknown>).MediaRecorder as
          | {
              new (stream: WebStream, options?: Record<string, unknown>): WebRecorder;
              isTypeSupported?: (mimeType: string) => boolean;
            }
          | undefined;

        if (!navigatorRef?.mediaDevices?.getUserMedia || !MediaRecorderCtor) {
          throw new Error("التسجيل الصوتي غير مدعوم في هذا المتصفح.");
        }

        const stream = await navigatorRef.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorderCtor.isTypeSupported?.("audio/webm") ? "audio/webm" : undefined;
        const recorder = new MediaRecorderCtor(stream, mimeType ? { mimeType } : undefined);

        recordingChunksRef.current = [];
        webRecordingStreamRef.current = stream;
        webMediaRecorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
          if (event.data && typeof event.data === "object" && "size" in event.data && Number((event.data as { size?: number }).size) > 0) {
            recordingChunksRef.current.push(event.data);
          }
        };
        recorder.onstop = () => {
          void finalizeWebRecording(recorder.mimeType || mimeType || "audio/webm");
        };
        recorder.start();
      } else {
        nativeRecordingRef.current = await startNativeAudioRecording();
      }

      setIsRecording(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر بدء التسجيل الصوتي.");
    } finally {
      setRecordingBusy(false);
    }
  }

  async function stopRecording() {
    setError("");
    setMessage("");
    setRecordingBusy(true);

    try {
      if (Platform.OS === "web") {
        const recorder = webMediaRecorderRef.current;
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        } else {
          stopWebRecordingTracks();
        }
      } else {
        const nextAttachment = await stopNativeAudioRecording(nativeRecordingRef.current);
        nativeRecordingRef.current = null;
        setAttachment(nextAttachment);
        setMessage("تم تجهيز التسجيل الصوتي للإرسال.");
      }
      setIsRecording(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التسجيل الصوتي.");
      setIsRecording(false);
    } finally {
      setRecordingBusy(false);
    }
  }

  async function finalizeWebRecording(mimeType: string) {
    try {
      const BlobCtor = (globalThis as Record<string, unknown>).Blob as
        | (new (chunks: unknown[], options?: Record<string, unknown>) => unknown)
        | undefined;

      if (!BlobCtor) {
        throw new Error("حفظ التسجيل غير مدعوم في هذه البيئة.");
      }

      const blob = new BlobCtor(recordingChunksRef.current, { type: mimeType });
      const nextAttachment = await blobToMessageAttachment(blob, `voice-note-${Date.now()}.webm`, mimeType);
      setAttachment(nextAttachment);
      setMessage("تم تجهيز التسجيل الصوتي للإرسال.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ التسجيل الصوتي.");
    } finally {
      recordingChunksRef.current = [];
      webMediaRecorderRef.current = null;
      stopWebRecordingTracks();
      setIsRecording(false);
      setRecordingBusy(false);
    }
  }

  function stopWebRecordingTracks() {
    webRecordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    webRecordingStreamRef.current = null;
  }

  if (loading) {
    return <LoadingState text="جار تحميل المحادثات..." />;
  }

  if (!isPatient && !isDoctor) {
    return (
      <Screen>
        <HeaderCard eyebrow="المحادثات" icon="chatbubble-outline" title="المحادثة الطبية" />
        <EmptyState text="المحادثات الطبية متاحة للمريض والطبيب فقط في نظام المركز المتوسط." />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <HeaderCard
        eyebrow="تواصل طبي"
        icon="chatbubble-ellipses-outline"
        subtitle="اختر محادثة مفتوحة أو افتح محادثة جديدة من القائمة."
        title="المحادثات الطبية"
      />

      {error ? <Notice text={error} tone="error" /> : null}
      {message ? <Notice text={message} tone="success" /> : null}

      <Card>
        <SectionTitle
          title="محادثة جديدة"
          subtitle={isPatient ? "اختر الطبيب من القائمة." : "اختر المريض من القائمة."}
        />
        {isPatient ? (
          <ChipRow>
            {doctors.map((doctor) => (
              <ChoiceChip
                key={doctor.id}
                label={`${doctor.fullName} - ${doctor.specialization}`}
                onPress={() => setSelectedDoctorId(doctor.id)}
                selected={selectedDoctorId === doctor.id}
              />
            ))}
          </ChipRow>
        ) : (
          <ChipRow>
            {patients.map((patient) => (
              <ChoiceChip
                key={patient.id}
                label={`${patient.fullName} - ${patient.medicalRecordNumber}`}
                onPress={() => {
                  setSelectedPatientId(patient.id);
                  if (patient.threadId) setSelectedThreadId(patient.threadId);
                }}
                selected={selectedPatientId === patient.id}
              />
            ))}
          </ChipRow>
        )}
        <AppButton
          disabled={busy || (isPatient ? !selectedDoctorId : !selectedPatientId)}
          icon="add-circle-outline"
          label="فتح محادثة"
          onPress={() => void startThread()}
        />
      </Card>

      <Card>
        <SectionTitle title="قائمة المحادثات" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.threadTabs}>
          {threads.map((thread) => {
            const active = selectedThread?.id === thread.id;
            return (
              <ChoiceChip
                key={thread.id}
                label={`${isPatient ? thread.doctor.fullName : thread.patient.fullName}${thread.status === "CLOSED" ? " - مغلقة" : ""}`}
                onPress={() => setSelectedThreadId(thread.id)}
                selected={active}
              />
            );
          })}
        </ScrollView>
        {threads.length === 0 ? <EmptyState text="لا توجد محادثات مفتوحة حاليا." /> : null}
      </Card>

      {selectedThread ? (
        <Card style={styles.chatCard}>
          <SectionTitle
            title={isPatient ? selectedThread.doctor.fullName : selectedThread.patient.fullName}
            subtitle={`${isPatient ? selectedThread.doctor.departmentName : selectedThread.patient.medicalRecordNumber}${selectedThreadClosed ? " | مغلقة" : " | مفتوحة"}`}
          />
          {selectedThreadClosed ? (
            <Notice text="هذه المحادثة مغلقة حاليا. أعد فتحها حتى تتمكن من إرسال رسائل أو ملفات." tone="info" />
          ) : null}
          <AppButton
            disabled={busy}
            icon={selectedThreadClosed ? "sync-outline" : "close-circle-outline"}
            label={selectedThreadClosed ? "إعادة فتح المحادثة" : "إغلاق المحادثة"}
            onPress={() => void toggleThreadStatus()}
            tone="ghost"
          />

          <View style={styles.messageStack}>
            {selectedThread.messages.length === 0 ? <EmptyState text="لا توجد رسائل داخل هذه المحادثة بعد." /> : null}
            {selectedThread.messages.map((item) => {
              const mine = item.sender.id === user?.id;
              return (
                <View key={item.id} style={[styles.messageBubble, mine ? styles.messageSelf : styles.messagePeer]}>
                  <Text style={[styles.messageSender, mine && styles.messageSenderSelf]}>{item.sender.fullName}</Text>
                  {item.content ? (
                    <Text style={[styles.messageText, mine && styles.messageTextSelf]}>{item.content}</Text>
                  ) : null}
                  {item.attachment ? <AttachmentPreview attachment={item.attachment} mine={mine} /> : null}
                  <Text style={[styles.messageTime, mine && styles.messageTimeSelf]}>{formatDateTime(item.createdAt)}</Text>
                </View>
              );
            })}
          </View>

          <TextField
            editable={!selectedThreadClosed}
            multiline
            onChangeText={setDraft}
            placeholder={selectedThreadClosed ? "المحادثة مغلقة حاليا." : "اكتب رسالتك هنا..."}
            value={draft}
          />

          <View style={styles.attachmentActions}>
            <AppButton
              disabled={busy || recordingBusy || isRecording || selectedThreadClosed}
              icon="attach-outline"
              label="إرفاق ملف"
              onPress={() => void chooseAttachment()}
              style={styles.actionButton}
              tone="ghost"
            />
            <AppButton
              disabled={busy || recordingBusy || selectedThreadClosed}
              icon={isRecording ? "stop-circle-outline" : "mic-outline"}
              label={isRecording ? "إيقاف التسجيل" : "تسجيل صوتي"}
              onPress={() => void (isRecording ? stopRecording() : startRecording())}
              style={styles.actionButton}
              tone={isRecording ? "danger" : "ghost"}
            />
          </View>

          {isRecording ? <Notice text="جار التسجيل الآن..." /> : null}
          {attachment ? (
            <AttachmentPreview attachment={attachment} draft onRemove={() => setAttachment(null)} />
          ) : null}

          <AppButton
            disabled={busy || recordingBusy || !canSend}
            icon="send-outline"
            label="إرسال الرسالة"
            onPress={() => void sendMessage()}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function AttachmentPreview({
  attachment,
  mine,
  draft,
  onRemove
}: {
  attachment: MessageAttachmentDraft;
  mine?: boolean;
  draft?: boolean;
  onRemove?: () => void;
}) {
  const kind = getAttachmentKind(attachment.mimeType);
  const kindLabel = kind === "image" ? "صورة" : kind === "audio" ? "تسجيل صوتي" : kind === "pdf" ? "ملف PDF" : "ملف";

  return (
    <View style={[styles.attachmentBox, mine && styles.attachmentBoxSelf, draft && styles.attachmentBoxDraft]}>
      <View style={styles.attachmentTop}>
        {onRemove ? (
          <Pressable onPress={onRemove} style={styles.removeAttachmentButton}>
            <AppIcon name="close-circle-outline" size={15} color={colors.danger} />
          </Pressable>
        ) : null}
        <View style={styles.attachmentTextWrap}>
          <Text numberOfLines={1} style={[styles.attachmentName, mine && styles.attachmentNameSelf]}>
            {attachment.fileName}
          </Text>
          <Text style={[styles.attachmentMeta, mine && styles.attachmentMetaSelf]}>
            {kindLabel} - {formatFileSize(attachment.sizeBytes)}
          </Text>
        </View>
      </View>

      {kind === "image" ? (
        <Image source={{ uri: attachmentDataUri(attachment) }} resizeMode="cover" style={styles.attachmentImage} />
      ) : null}

      {kind === "audio" ? (
        <View style={[styles.audioPill, mine && styles.audioPillSelf]}>
          <AppIcon name="mic-outline" size={16} color={mine ? "#fff" : colors.primary} />
          <Text style={[styles.audioText, mine && styles.audioTextSelf]}>تسجيل صوتي مرفق</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  threadTabs: {
    flexDirection: "row-reverse",
    gap: spacing.xs,
    paddingVertical: 2
  },
  chatCard: {
    paddingBottom: spacing.lg
  },
  messageStack: {
    gap: spacing.sm
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 6
  },
  messagePeer: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceMuted
  },
  messageSelf: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary
  },
  messageSender: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "right"
  },
  messageSenderSelf: {
    color: "#dff5ec"
  },
  messageText: {
    color: colors.text,
    textAlign: "right",
    lineHeight: 22
  },
  messageTextSelf: {
    color: "#fff"
  },
  messageTime: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "right"
  },
  messageTimeSelf: {
    color: "rgba(255,255,255,0.78)"
  },
  attachmentActions: {
    flexDirection: "row-reverse",
    gap: spacing.sm
  },
  actionButton: {
    flex: 1
  },
  attachmentBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    backgroundColor: "#fff",
    padding: spacing.sm,
    gap: spacing.xs
  },
  attachmentBoxSelf: {
    backgroundColor: "rgba(255,255,255,0.13)",
    borderColor: "rgba(255,255,255,0.28)"
  },
  attachmentBoxDraft: {
    backgroundColor: colors.surfaceMuted
  },
  attachmentTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  attachmentTextWrap: {
    flex: 1,
    gap: 2
  },
  attachmentName: {
    color: colors.text,
    fontWeight: "900",
    textAlign: "right"
  },
  attachmentNameSelf: {
    color: "#fff"
  },
  attachmentMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right"
  },
  attachmentMetaSelf: {
    color: "rgba(255,255,255,0.78)"
  },
  removeAttachmentButton: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fdecec"
  },
  attachmentImage: {
    width: "100%",
    height: 150,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted
  },
  audioPill: {
    minHeight: 38,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm
  },
  audioPillSelf: {
    backgroundColor: "rgba(255,255,255,0.16)"
  },
  audioText: {
    color: colors.primary,
    fontWeight: "900"
  },
  audioTextSelf: {
    color: "#fff"
  }
});

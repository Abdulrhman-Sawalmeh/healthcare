import { useEffect, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { DoctorRecord, ThreadRecord } from "../types";
import { colors, radii, spacing } from "../theme/tokens";

const timeFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function MessagesScreen() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [draft, setDraft] = useState("");
  const [newThreadMessage, setNewThreadMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    try {
      const [threadsPayload, doctorsPayload] = await Promise.all([
        apiRequest<ThreadRecord[]>("/communications/threads"),
        user?.role === "PATIENT"
          ? apiRequest<DoctorRecord[]>("/doctors")
          : Promise.resolve<DoctorRecord[]>([])
      ]);

      setThreads(threadsPayload);
      setDoctors(doctorsPayload);
      setError("");

      if (!selectedThreadId && threadsPayload[0]) {
        setSelectedThreadId(threadsPayload[0].id);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load messages.");
    }
  }

  useEffect(() => {
    void loadData();
  }, [user?.role]);

  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];

  async function sendMessage() {
    if (!selectedThread || !draft.trim()) {
      return;
    }

    await apiRequest(`/communications/threads/${selectedThread.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content: draft })
    });

    setDraft("");
    await loadData();
  }

  async function createThread() {
    if (user?.role !== "PATIENT" || !doctors[0] || !newThreadMessage.trim()) {
      return;
    }

    await apiRequest("/communications/threads", {
      method: "POST",
      body: JSON.stringify({
        doctorId: doctors[0].id,
        initialMessage: newThreadMessage
      })
    });

    setNewThreadMessage("");
    await loadData();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Secure messages</Text>
      <Text style={styles.subtitle}>Stay in touch with your care team without leaving the mobile app.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.threadTabs}>
        {threads.map((thread) => (
          <Pressable
            key={thread.id}
            onPress={() => setSelectedThreadId(thread.id)}
            style={[styles.threadChip, selectedThread?.id === thread.id ? styles.threadChipActive : undefined]}
          >
            <Text
              style={[
                styles.threadChipTitle,
                selectedThread?.id === thread.id ? styles.threadChipTitleActive : undefined
              ]}
            >
              {user?.role === "PATIENT" ? thread.doctor.fullName : thread.patient.fullName}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {selectedThread ? (
        <>
          <ScrollView contentContainerStyle={styles.messageStack} showsVerticalScrollIndicator={false}>
            {selectedThread.messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.sender.id === user?.id ? styles.messageSelf : styles.messagePeer
                ]}
              >
                <Text style={styles.messageSender}>{message.sender.fullName}</Text>
                <Text
                  style={[
                    styles.messageText,
                    message.sender.id === user?.id ? styles.messageTextSelf : undefined
                  ]}
                >
                  {message.content}
                </Text>
                <Text
                  style={[
                    styles.messageTime,
                    message.sender.id === user?.id ? styles.messageTimeSelf : undefined
                  ]}
                >
                  {timeFormatter.format(new Date(message.createdAt))}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              onChangeText={setDraft}
              placeholder="Write a secure message..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={draft}
            />
            <Pressable onPress={() => void sendMessage()} style={styles.sendButton}>
              <Text style={styles.sendText}>Send</Text>
            </Pressable>
          </View>
        </>
      ) : user?.role === "PATIENT" && doctors[0] ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>Start your first care chat</Text>
          <TextInput
            onChangeText={setNewThreadMessage}
            placeholder={`Message ${doctors[0].fullName}`}
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={newThreadMessage}
          />
          <Pressable onPress={() => void createThread()} style={styles.sendButton}>
            <Text style={styles.sendText}>Start thread</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyTitle}>No threads available yet.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.sm
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted
  },
  threadTabs: {
    gap: spacing.sm,
    paddingVertical: spacing.sm
  },
  threadChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border
  },
  threadChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  threadChipTitle: {
    color: colors.text,
    fontWeight: "700"
  },
  threadChipTitleActive: {
    color: "#fff"
  },
  messageStack: {
    gap: spacing.sm,
    paddingBottom: spacing.md
  },
  messageBubble: {
    maxWidth: "86%",
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 4
  },
  messagePeer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  messageSelf: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary
  },
  messageSender: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  messageText: {
    color: colors.text
  },
  messageTextSelf: {
    color: "#fff"
  },
  messageTime: {
    color: colors.muted,
    fontSize: 12
  },
  messageTimeSelf: {
    color: "rgba(255,255,255,0.76)"
  },
  composer: {
    gap: spacing.sm,
    paddingTop: spacing.sm
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 999,
    alignItems: "center",
    paddingVertical: spacing.md
  },
  sendText: {
    color: "#fff",
    fontWeight: "800"
  },
  emptyPanel: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border
  },
  emptyTitle: {
    color: colors.text,
    fontWeight: "800"
  },
  error: {
    color: colors.danger,
    fontWeight: "700"
  }
});

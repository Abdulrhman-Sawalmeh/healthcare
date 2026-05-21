import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { formatDateTime } from "../lib/arabic";
import { PortalDoctorRecord, PortalSummary, PortalThreadRecord } from "../types";

function sortThreads(threads: PortalThreadRecord[]) {
  return [...threads].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  );
}

function upsertThread(threads: PortalThreadRecord[], nextThread: PortalThreadRecord) {
  return sortThreads([nextThread, ...threads.filter((thread) => thread.id !== nextThread.id)]);
}

function getUnreadMessagesCount(thread: PortalThreadRecord, currentRole: string | undefined) {
  if (!currentRole) {
    return 0;
  }

  return thread.messages.filter(
    (message) => !message.isRead && message.sender.role !== currentRole
  ).length;
}

function getLatestMessage(thread: PortalThreadRecord) {
  return thread.messages[thread.messages.length - 1] ?? null;
}

function getPartnerName(thread: PortalThreadRecord, isDoctorView: boolean) {
  return isDoctorView ? thread.patient.fullName : thread.doctor.fullName;
}

function threadMatchesQuery(thread: PortalThreadRecord, isDoctorView: boolean, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const latestMessage = getLatestMessage(thread);
  const searchableText = [
    getPartnerName(thread, isDoctorView),
    thread.patient.fullName,
    thread.doctor.fullName,
    thread.doctor.departmentName,
    latestMessage?.content ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(normalizedQuery);
}

export function PatientMessagesPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [threads, setThreads] = useState<PortalThreadRecord[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [newDoctorId, setNewDoctorId] = useState("");
  const [newThreadMessage, setNewThreadMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [conversationQuery, setConversationQuery] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [patientSubscriptionActive, setPatientSubscriptionActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isDoctorView = user?.role === "DOCTOR";

  async function loadData(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const [threadsPayload, doctorsPayload, summaryPayload] = await Promise.all([
        apiRequest<PortalThreadRecord[]>("/portal/communications/threads"),
        isDoctorView
          ? Promise.resolve([] as PortalDoctorRecord[])
          : apiRequest<PortalDoctorRecord[]>("/portal/doctors"),
        isDoctorView ? Promise.resolve(null) : apiRequest<PortalSummary>("/portal/summary")
      ]);

      const sortedThreads = sortThreads(threadsPayload);
      setThreads(sortedThreads);
      setDoctors(doctorsPayload);
      setPatientSubscriptionActive(isDoctorView || (summaryPayload?.stats.activeSubscriptions ?? 0) > 0);
      setSelectedThreadId((currentThreadId) =>
        currentThreadId && sortedThreads.some((thread) => thread.id === currentThreadId)
          ? currentThreadId
          : (sortedThreads[0]?.id ?? "")
      );
    } catch {
      setError(t("تعذر تحميل المحادثات الطبية.", "Could not load medical conversations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(true);

    const intervalId = window.setInterval(() => {
      void loadData();
    }, 20000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isDoctorView]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) ?? null,
    [threads, selectedThreadId]
  );
  const unreadMessagesCount = useMemo(
    () =>
      threads.reduce(
        (total, thread) => total + getUnreadMessagesCount(thread, user?.role),
        0
      ),
    [threads, user?.role]
  );
  const unreadThreadsCount = useMemo(
    () =>
      threads.filter((thread) => getUnreadMessagesCount(thread, user?.role) > 0).length,
    [threads, user?.role]
  );
  const visibleThreads = useMemo(
    () =>
      threads.filter((thread) => {
        const unreadCount = getUnreadMessagesCount(thread, user?.role);

        if (showUnreadOnly && unreadCount === 0) {
          return false;
        }

        return threadMatchesQuery(thread, isDoctorView, conversationQuery);
      }),
    [conversationQuery, isDoctorView, showUnreadOnly, threads, user?.role]
  );

  useEffect(() => {
    if (!selectedThread || !user) {
      return;
    }

    if (getUnreadMessagesCount(selectedThread, user.role) === 0) {
      return;
    }

    apiRequest<PortalThreadRecord>(
      `/portal/communications/threads/${selectedThread.id}/read`,
      {
        method: "PATCH"
      }
    )
      .then((updatedThread) => {
        setThreads((currentThreads) => upsertThread(currentThreads, updatedThread));
      })
      .catch(() => undefined);
  }, [selectedThread?.id, selectedThread?.messages.length, user]);

  async function handleCreateThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newDoctorId || !newThreadMessage.trim()) {
      setError(t("يرجى اختيار الطبيب وكتابة الرسالة الافتتاحية.", "Choose a doctor and write the first message."));
      return;
    }

    try {
      const thread = await apiRequest<PortalThreadRecord>("/portal/communications/threads", {
        method: "POST",
        body: JSON.stringify({
          doctorId: newDoctorId,
          initialMessage: newThreadMessage
        })
      });

      setNewDoctorId("");
      setNewThreadMessage("");
      setConversationQuery("");
      setShowUnreadOnly(false);
      setSelectedThreadId(thread.id);
      setThreads((currentThreads) => upsertThread(currentThreads, thread));
      setError("");
    } catch {
      setError(t("تعذر إنشاء المحادثة الجديدة.", "Could not create the new conversation."));
    }
  }

  async function handleReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedThread || !replyMessage.trim()) {
      return;
    }

    try {
      const updatedThread = await apiRequest<PortalThreadRecord>(
        `/portal/communications/threads/${selectedThread.id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: replyMessage
          })
        }
      );

      setReplyMessage("");
      setThreads((currentThreads) => upsertThread(currentThreads, updatedThread));
      setError("");
    } catch {
      setError(t("تعذر إرسال الرسالة الحالية.", "Could not send the current message."));
    }
  }

  if (loading) {
    return <div className="screen-center">{t("جاري تحميل المحادثات الطبية...", "Loading medical conversations...")}</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">{isDoctorView ? t("محادثات المرضى", "Patient conversations") : t("المحادثة مع الطبيب", "Doctor conversations")}</p>
          <h1>{isDoctorView ? t("صندوق محادثات الطبيب", "Doctor chat inbox") : t("رسائل المتابعة الطبية", "Medical follow-up messages")}</h1>
          <p className="muted">
            {isDoctorView
              ? t("اختر أي مريض من القائمة، راجع آخر الرسائل، ورد من نفس الصفحة.", "Choose any patient conversation, review the latest messages, and reply from the same page.")
              : t("اختر محادثة مفتوحة أو ابدأ محادثة جديدة مع طبيبك عند تفعيل الاشتراك.", "Choose an open conversation or start a new one with your doctor when your subscription is active.")}
          </p>
        </div>
        <div className="tile-stats">
          <span>{t("المحادثات", "Conversations")}: {threads.length}</span>
          <span>{t("الرسائل غير المقروءة", "Unread messages")}: {unreadMessagesCount}</span>
          <span>{t("محادثات تحتاج متابعة", "Needs follow-up")}: {unreadThreadsCount}</span>
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {!isDoctorView && !patientSubscriptionActive ? (
        <section className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">{t("الاشتراك مطلوب", "Subscription required")}</p>
              <h3>{t("فعّل دعم المتابعة للتواصل مع طبيبك", "Activate follow-up support to contact your doctor")}</h3>
            </div>
          </div>
          <p className="muted">
            {t(
              "يمكنك الاستمرار في عرض السجل الصحي والوصفات. التواصل مع الطبيب متاح ضمن الاشتراك للمتابعة والتذكيرات.",
              "You can still view health history and prescriptions. Doctor messaging is included with the subscription for follow-up and reminders."
            )}
          </p>
        </section>
      ) : null}

      <section className="messages-layout chat-workspace">
        <aside className="section-card conversation-sidebar">
          <div className="section-header">
            <div>
              <p className="eyebrow">{t("القائمة", "Inbox")}</p>
              <h3>{isDoctorView ? t("محادثات المرضى", "Patient chats") : t("محادثاتي", "My chats")}</h3>
            </div>
          </div>

          <div className="conversation-tools">
            <label className="field compact-field">
              <span>{t("بحث", "Search")}</span>
              <input
                value={conversationQuery}
                onChange={(event) => setConversationQuery(event.target.value)}
                placeholder={isDoctorView ? t("اسم المريض أو آخر رسالة", "Patient name or latest message") : t("اسم الطبيب أو آخر رسالة", "Doctor name or latest message")}
              />
            </label>
            <button
              className={showUnreadOnly ? "ghost-button active-filter" : "ghost-button"}
              type="button"
              onClick={() => setShowUnreadOnly((current) => !current)}
            >
              {showUnreadOnly ? t("عرض الكل", "Show all") : t("غير المقروء فقط", "Unread only")}
            </button>
          </div>

          {!isDoctorView && patientSubscriptionActive ? (
            <form className="conversation-create" onSubmit={handleCreateThread}>
              <label className="field compact-field">
                <span>{t("طبيب جديد", "New doctor chat")}</span>
                <select value={newDoctorId} onChange={(event) => setNewDoctorId(event.target.value)}>
                  <option value="">{t("اختر الطبيب", "Choose doctor")}</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.fullName} - {doctor.specialization}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field compact-field">
                <span>{t("الرسالة الأولى", "First message")}</span>
                <textarea
                  value={newThreadMessage}
                  onChange={(event) => setNewThreadMessage(event.target.value)}
                  placeholder={t("اكتب سبب التواصل باختصار", "Write the reason for contact")}
                />
              </label>
              <button className="primary-button" type="submit">
                {t("فتح محادثة", "Open chat")}
              </button>
            </form>
          ) : null}

          <div className="thread-list conversation-list">
            {visibleThreads.map((thread) => {
              const latestMessage = getLatestMessage(thread);
              const unreadCount = getUnreadMessagesCount(thread, user?.role);
              const partnerName = getPartnerName(thread, isDoctorView);

              return (
                <button
                  key={thread.id}
                  className={thread.id === selectedThreadId ? "thread-item active" : "thread-item"}
                  type="button"
                  aria-current={thread.id === selectedThreadId ? "true" : undefined}
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <div className="thread-item-top">
                    <strong>{partnerName}</strong>
                    {unreadCount > 0 ? (
                      <span className="thread-unread-badge">{unreadCount}</span>
                    ) : null}
                  </div>
                  <span className="thread-meta">
                    {isDoctorView ? t("مريض", "Patient") : thread.doctor.departmentName}
                  </span>
                  <span className="thread-preview">{latestMessage?.content ?? t("لا توجد رسائل بعد.", "No messages yet.")}</span>
                  <span className="thread-time">{latestMessage ? formatDateTime(latestMessage.createdAt) : "-"}</span>
                </button>
              );
            })}
            {visibleThreads.length === 0 ? (
              <div className="empty-state compact">
                {threads.length === 0
                  ? isDoctorView
                    ? t("لا توجد محادثات من المرضى مرتبطة بك بعد.", "No patient conversations are linked to you yet.")
                    : t("لا توجد محادثات مفتوحة بعد.", "No open conversations yet.")
                  : t("لا توجد محادثات تطابق البحث الحالي.", "No conversations match the current filter.")}
              </div>
            ) : null}
          </div>
        </aside>

        <article className="section-card chat-panel">
          <div className="chat-heading">
            <div>
              <p className="eyebrow">{t("المحادثة النشطة", "Active conversation")}</p>
              <h3>
                {selectedThread
                  ? getPartnerName(selectedThread, isDoctorView)
                  : isDoctorView
                    ? t("اختر مريضاً من القائمة", "Choose a patient from the list")
                    : t("اختر محادثة من القائمة", "Choose a conversation from the list")}
              </h3>
              {selectedThread ? (
                <span className="muted">
                  {isDoctorView
                    ? t("مريض", "Patient")
                    : selectedThread.doctor.departmentName}
                </span>
              ) : null}
            </div>
            {selectedThread ? (
              <span className="status-badge status-success">
                {t("مفتوحة", "Open")}
              </span>
            ) : null}
          </div>

          {selectedThread ? (
            <>
              <div className="message-stream">
                {selectedThread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.sender.role === user?.role
                        ? "message-bubble from-self"
                        : "message-bubble from-peer"
                    }
                  >
                    <strong>{message.sender.fullName}</strong>
                    <p>{message.content}</p>
                    <span>{formatDateTime(message.createdAt)}</span>
                  </div>
                ))}
              </div>

              <form className="message-form" onSubmit={handleReply}>
                <textarea
                  value={replyMessage}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  disabled={!isDoctorView && !patientSubscriptionActive}
                  placeholder={
                    isDoctorView
                      ? t("اكتب ردك للمريض هنا...", "Write your reply to the patient here...")
                      : t("اكتب رسالتك للطبيب هنا...", "Write your message to the doctor here...")
                  }
                />
                <button className="primary-button" disabled={!isDoctorView && !patientSubscriptionActive} type="submit">
                  {t("إرسال الرسالة", "Send message")}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state compact">
              {isDoctorView
                ? t("اختر محادثة لعرض رسائل المريض والرد عليها.", "Choose a conversation to view and reply to patient messages.")
                : t("اختر محادثة أو ابدأ محادثة جديدة مع طبيبك.", "Choose a conversation or start a new chat with your doctor.")}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

import { FormEvent, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatDateTime } from "../lib/arabic";
import { PortalDoctorRecord, PortalThreadRecord } from "../types";

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

export function PatientMessagesPage() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<PortalThreadRecord[]>([]);
  const [doctors, setDoctors] = useState<PortalDoctorRecord[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [newDoctorId, setNewDoctorId] = useState("");
  const [newThreadMessage, setNewThreadMessage] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isDoctorView = user?.role === "DOCTOR";

  async function loadData(showLoading = false) {
    if (showLoading) {
      setLoading(true);
    }

    setError("");

    try {
      const [threadsPayload, doctorsPayload] = await Promise.all([
        apiRequest<PortalThreadRecord[]>("/portal/communications/threads"),
        isDoctorView
          ? Promise.resolve([] as PortalDoctorRecord[])
          : apiRequest<PortalDoctorRecord[]>("/portal/doctors")
      ]);

      setThreads(sortThreads(threadsPayload));
      setDoctors(doctorsPayload);
      setSelectedThreadId((currentThreadId) =>
        currentThreadId && threadsPayload.some((thread) => thread.id === currentThreadId)
          ? currentThreadId
          : (threadsPayload[0]?.id ?? "")
      );
    } catch {
      setError("تعذر تحميل المحادثات الطبية.");
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
      setError("يرجى اختيار الطبيب وكتابة الرسالة الافتتاحية.");
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
      setSelectedThreadId(thread.id);
      setThreads((currentThreads) => upsertThread(currentThreads, thread));
      setError("");
    } catch {
      setError("تعذر إنشاء المحادثة الجديدة.");
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
      setError("تعذر إرسال الرسالة الحالية.");
    }
  }

  if (loading) {
    return <div className="screen-center">جارٍ تحميل المحادثات الطبية...</div>;
  }

  return (
    <div className="page-stack">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">{isDoctorView ? "رسائل المرضى" : "المحادثة مع الطبيب"}</p>
          <h1>{isDoctorView ? "صندوق رسائل الطبيب" : "تواصل آمن ومنظم"}</h1>
          <p className="muted">
            {isDoctorView
              ? "تظهر هنا جميع محادثات المرضى المرتبطة بك، مع تنبيه واضح للرسائل الجديدة."
              : "ابدأ محادثة جديدة أو أكمل النقاش مع طبيبك حول الخطة العلاجية والمواعيد القادمة."}
          </p>
        </div>
        <div className="tile-stats">
          <span>المحادثات: {threads.length}</span>
          <span>الرسائل غير المقروءة: {unreadMessagesCount}</span>
          {isDoctorView ? <span>محادثات بانتظار رد: {unreadThreadsCount}</span> : null}
        </div>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {!isDoctorView ? (
        <section className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">بدء محادثة</p>
              <h3>رسالة افتتاحية للطبيب</h3>
            </div>
          </div>
          <form className="form-grid" onSubmit={handleCreateThread}>
            <label className="field">
              <span>اختيار الطبيب</span>
              <select value={newDoctorId} onChange={(event) => setNewDoctorId(event.target.value)}>
                <option value="">اختر الطبيب</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.fullName} - {doctor.specialization}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field-span-2">
              <span>الرسالة الافتتاحية</span>
              <textarea
                value={newThreadMessage}
                onChange={(event) => setNewThreadMessage(event.target.value)}
              />
            </label>
            <div className="field-span-2">
              <button className="primary-button" type="submit">
                فتح المحادثة
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="messages-layout">
        <article className="section-card">
          <div className="section-header">
            <div>
              <p className="eyebrow">المحادثات الحالية</p>
              <h3>{isDoctorView ? "اختر محادثة مع مريض" : "اختيار المحادثة"}</h3>
            </div>
          </div>
          <div className="thread-list">
            {threads.map((thread) => {
              const latestMessage = thread.messages[thread.messages.length - 1];
              const unreadCount = getUnreadMessagesCount(thread, user?.role);
              const partnerName = isDoctorView ? thread.patient.fullName : thread.doctor.fullName;

              return (
                <button
                  key={thread.id}
                  className={thread.id === selectedThreadId ? "thread-item active" : "thread-item"}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  <div className="thread-item-top">
                    <strong>{partnerName}</strong>
                    {unreadCount > 0 ? (
                      <span className="thread-unread-badge">{unreadCount} جديدة</span>
                    ) : null}
                  </div>
                  <span>{latestMessage?.content ?? "لا توجد رسائل بعد."}</span>
                  <span>{latestMessage ? formatDateTime(latestMessage.createdAt) : "-"}</span>
                </button>
              );
            })}
            {threads.length === 0 ? (
              <div className="empty-state compact">
                {isDoctorView
                  ? "لا توجد محادثات من المرضى مرتبطة بك بعد."
                  : "لا توجد محادثات مفتوحة بعد."}
              </div>
            ) : null}
          </div>
        </article>

        <article className="section-card chat-panel">
          <div className="section-header">
            <div>
              <p className="eyebrow">تفاصيل المحادثة</p>
              <h3>
                {selectedThread
                  ? isDoctorView
                    ? selectedThread.patient.fullName
                    : selectedThread.doctor.fullName
                  : isDoctorView
                    ? "اختر محادثة من المرضى"
                    : "اختر محادثة من القائمة"}
              </h3>
            </div>
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
                  placeholder={
                    isDoctorView
                      ? "اكتب ردك للمريض هنا..."
                      : "اكتب رسالتك للطبيب هنا..."
                  }
                />
                <button className="primary-button" type="submit">
                  إرسال الرسالة
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state compact">
              {isDoctorView
                ? "اختر محادثة لعرض رسائل المريض والرد عليها."
                : "اختر محادثة أو ابدأ محادثة جديدة مع طبيبك."}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}

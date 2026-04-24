import {
  AlertSeverity,
  NetworkNotificationStatus,
  NetworkNotificationType,
  NetworkReferralPriority,
  Prisma
} from "@prisma/client";

import { BackendSystemConfig } from "../config/system";
import { prisma } from "../lib/prisma";
import { resolveReferralRequest } from "./referral-engine";

type RetryableNotification = {
  id: number;
  centerId?: number;
  targetCenterId?: number;
  retryCount: number;
  maxRetries: number;
};

let workerStarted = false;

function asJson(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function scheduleRetry(baseTime = new Date(), minutes = 60) {
  return new Date(baseTime.getTime() + minutes * 60 * 1000);
}

async function createCenterAlert(centerId: number, title: string, message: string, severity: AlertSeverity) {
  await prisma.centerSystemAlert.create({
    data: {
      centerId,
      alertType: "notification_processing",
      severity,
      title,
      message
    }
  });
}

async function createProcessingLog(input: {
  centerId: number;
  severity?: AlertSeverity;
  message: string;
  incomingNotificationId?: number;
  outgoingNotificationId?: number;
  context?: unknown;
}) {
  await prisma.notificationProcessingLog.create({
    data: {
      centerId: input.centerId,
      severity: input.severity ?? "INFO",
      message: input.message,
      incomingNotificationId: input.incomingNotificationId,
      outgoingNotificationId: input.outgoingNotificationId,
      context: input.context ? asJson(input.context) : undefined
    }
  });
}

async function createCommunicationLog(input: {
  centerId: number;
  direction: "TO_CENTER" | "FROM_CENTER";
  notificationType: NetworkNotificationType;
  status: NetworkNotificationStatus;
  requestPayload?: unknown;
  responsePayload?: unknown;
  errorMessage?: string;
}) {
  await prisma.communicationLog.create({
    data: {
      centerId: input.centerId,
      direction: input.direction,
      notificationType: input.notificationType,
      status: input.status,
      requestPayload: input.requestPayload ? asJson(input.requestPayload) : undefined,
      responsePayload: input.responsePayload ? asJson(input.responsePayload) : undefined,
      errorMessage: input.errorMessage
    }
  });
}

async function markRetryFailure(
  notification: RetryableNotification,
  error: unknown,
  update: (data: {
    retryCount: number;
    status: NetworkNotificationStatus;
    nextRetryAt: Date | null;
    lastError?: string;
    responseError?: string;
  }) => Promise<void>
) {
  const retryCount = notification.retryCount + 1;
  const isPermanentFailure = retryCount >= notification.maxRetries;
  const errorMessage = error instanceof Error ? error.message : "حدث خطأ غير معروف أثناء المعالجة.";

  await update({
    retryCount,
    status: isPermanentFailure ? "PERMANENT_FAILURE" : "FAILED",
    nextRetryAt: isPermanentFailure ? null : scheduleRetry(),
    lastError: errorMessage,
    responseError: errorMessage
  });

  const affectedCenterId = notification.centerId ?? notification.targetCenterId;

  if (affectedCenterId) {
    await createCenterAlert(
      affectedCenterId,
      isPermanentFailure ? "فشل الإشعار نهائيًا" : "تمت جدولة إعادة محاولة للإشعار",
      errorMessage,
      isPermanentFailure ? "ERROR" : "WARNING"
    );
  }
}

async function handleRequestNewVisits(centerId: number, payload: Record<string, unknown>) {
  const fromDate = payload.from_date ? new Date(String(payload.from_date)) : new Date(0);
  const toDate = payload.to_date ? new Date(String(payload.to_date)) : new Date();
  const maxRecords = Number(payload.max_records ?? 100);

  const visits = await prisma.localVisit.findMany({
    where: {
      centerId,
      syncedToCentral: false,
      visitDate: {
        gte: fromDate,
        lte: toDate
      }
    },
    include: {
      patient: true,
      doctor: true
    },
    take: maxRecords,
    orderBy: {
      visitDate: "asc"
    }
  });

  let syncedCount = 0;

  for (const visit of visits) {
    let unifiedPatientId = visit.patient.unifiedPatientId;

    if (!unifiedPatientId) {
      const unifiedPatient = await prisma.unifiedPatient.create({
        data: {
          unifiedId: visit.patient.unifiedId ?? `P-${new Date().getFullYear()}-${String(visit.patient.id).padStart(7, "0")}`,
          fullName: visit.patient.fullName,
          dateOfBirth: visit.patient.dateOfBirth,
          gender: visit.patient.gender,
          primaryPhone: visit.patient.phone,
          address: visit.patient.address,
          bloodType: visit.patient.bloodType,
          allergies: visit.patient.allergies,
          chronicDiseases: visit.patient.chronicDiseases
        }
      });

      unifiedPatientId = unifiedPatient.id;

      await prisma.localPatient.update({
        where: { id: visit.patient.id },
        data: {
          unifiedPatientId,
          unifiedId: unifiedPatient.unifiedId
        }
      });
    }

    const unifiedVisit = await prisma.unifiedVisit.create({
      data: {
        patientId: unifiedPatientId,
        centerId,
        visitDate: visit.visitDate,
        primaryDiagnosis: visit.diagnosis,
        visitType: visit.visitType,
        doctorName: visit.doctor?.fullName ?? "طبيب غير محدد",
        centerVisitId: `${centerId}-${visit.id}`
      }
    });

    await prisma.localVisit.update({
      where: { id: visit.id },
      data: {
        centralVisitId: unifiedVisit.id,
        syncedToCentral: true,
        syncState: "SYNCED",
        syncAttemptCount: {
          increment: 1
        }
      }
    });

    syncedCount += 1;
  }

  return {
    synced_visits: syncedCount,
    has_more: visits.length === maxRecords
  };
}

async function handleRequestPatientData(centerId: number, payload: Record<string, unknown>) {
  const unifiedId = String(payload.patient_unified_id ?? "");

  const patient = await prisma.localPatient.findFirst({
    where: {
      centerId,
      unifiedId
    },
    include: {
      visits: {
        orderBy: {
          visitDate: "desc"
        }
      }
    }
  });

  if (!patient) {
    throw new Error(`لم يتم العثور على المريض ${unifiedId} في بيانات المركز المحلية.`);
  }

  return {
    patient,
    visits: patient.visits
  };
}

async function handleRequestLabResults(centerId: number, payload: Record<string, unknown>) {
  const unifiedId = String(payload.patient_unified_id ?? "");
  const patient = await prisma.localPatient.findFirst({
    where: {
      centerId,
      unifiedId
    }
  });

  if (!patient) {
    throw new Error(`لم يتم العثور على المريض ${unifiedId} في بيانات المركز المحلية.`);
  }

  const labRequests = await prisma.labRequestLocal.findMany({
    where: {
      centerId,
      patientId: patient.id
    },
    include: {
      test: true
    },
    orderBy: {
      requestDate: "desc"
    }
  });

  return {
    patient: {
      id: patient.id,
      unified_id: patient.unifiedId,
      full_name: patient.fullName
    },
    results: labRequests.map((request) => ({
      id: request.id,
      test_name: request.test.testName,
      category: request.test.category,
      status: request.status,
      result_value: request.resultValue,
      result_date: request.resultDate
    }))
  };
}

async function handleCentralNotification(notificationId: number) {
  const notification = await prisma.centralNotification.findUnique({
    where: { id: notificationId },
    include: {
      targetCenter: true
    }
  });

  if (!notification) {
    return;
  }

  await prisma.centralNotification.update({
    where: { id: notification.id },
    data: {
      status: "PROCESSING",
      sentAt: notification.sentAt ?? new Date()
    }
  });

  const incoming = await prisma.incomingNotification.create({
    data: {
      centerId: notification.targetCenterId,
      centralNotificationId: notification.id,
      notificationType: notification.notificationType,
      payload: notification.payload as Prisma.InputJsonValue,
      status: "PROCESSING",
      processingStartedAt: new Date()
    }
  });

  try {
    const payload = notification.payload as Record<string, unknown>;
    let responsePayload: Record<string, unknown> = {};

    switch (notification.notificationType) {
      case "REQUEST_NEW_VISITS":
        responsePayload = await handleRequestNewVisits(notification.targetCenterId, payload);
        break;
      case "REQUEST_PATIENT_DATA":
        responsePayload = await handleRequestPatientData(notification.targetCenterId, payload);
        break;
      case "REQUEST_LAB_RESULTS":
        responsePayload = await handleRequestLabResults(notification.targetCenterId, payload);
        break;
      case "SYNC_MASTER_DATA":
        responsePayload = {
          synced: true,
          generated_at: new Date().toISOString()
        };
        break;
      case "PING":
        responsePayload = {
          pong: true,
          center_id: notification.targetCenterId,
          timestamp: new Date().toISOString()
        };
        break;
      case "NOTIFY_REFERRAL":
      case "NOTIFY_REFERRAL_RESPONSE":
      case "ALERT":
      default:
        responsePayload = {
          accepted: true
        };
        break;
    }

    await prisma.incomingNotification.update({
      where: { id: incoming.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        responsePayload: asJson(responsePayload),
        responseStatus: "success"
      }
    });

    await prisma.centralNotification.update({
      where: { id: notification.id },
      data: {
        status: "COMPLETED",
        acknowledgedAt: new Date(),
        completedAt: new Date(),
        responsePayload: asJson(responsePayload)
      }
    });

    await prisma.centralCenter.update({
      where: { id: notification.targetCenterId },
      data: { lastSyncAt: new Date() }
    });

    await createProcessingLog({
      centerId: notification.targetCenterId,
      incomingNotificationId: incoming.id,
      message: `تمت معالجة الإشعار الوارد من النوع ${notification.notificationType}.`,
      context: responsePayload
    });

    await createCommunicationLog({
      centerId: notification.targetCenterId,
      direction: "TO_CENTER",
      notificationType: notification.notificationType,
      status: "COMPLETED",
      requestPayload: notification.payload,
      responsePayload
    });
  } catch (error) {
    await markRetryFailure(notification, error, async (data) => {
      await prisma.centralNotification.update({
        where: { id: notification.id },
        data: {
          retryCount: data.retryCount,
          status: data.status,
          nextRetryAt: data.nextRetryAt,
          responseError: data.responseError
        }
      });
    });

    await prisma.incomingNotification.update({
      where: { id: incoming.id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        responseError: error instanceof Error ? error.message : "حدث خطأ غير معروف."
      }
    });

    await createProcessingLog({
      centerId: notification.targetCenterId,
      incomingNotificationId: incoming.id,
      severity: "ERROR",
      message: `فشلت معالجة الإشعار الوارد من النوع ${notification.notificationType}.`,
      context: {
        error: error instanceof Error ? error.message : "حدث خطأ غير معروف."
      }
    });
  }
}

async function handleOutgoingNotification(notificationId: number) {
  const notification = await prisma.outgoingNotification.findUnique({
    where: { id: notificationId },
    include: {
      center: true
    }
  });

  if (!notification) {
    return;
  }

  await prisma.outgoingNotification.update({
    where: { id: notification.id },
    data: {
      status: "PROCESSING"
    }
  });

  try {
    const payload = notification.payload as Record<string, unknown>;

    if (notification.notificationType === "REFERRAL_REQUEST") {
      const centerNotification = await prisma.centerNotification.create({
        data: {
          fromCenterId: notification.centerId,
          notificationType: "REFERRAL_REQUEST",
          payload: asJson(payload),
          status: "PROCESSING",
          receivedAt: new Date()
        }
      });

      const result = await resolveReferralRequest(notification.centerId, {
        patientUnifiedId: String(payload.patient_unified_id),
        requiredSpecialty: String(payload.required_specialty),
        priority: String(payload.priority ?? "NORMAL") as NetworkReferralPriority,
        reason: String(payload.reason ?? "تم طلب الإحالة من المركز المحلي."),
        requiresOr: Boolean(payload.requires_or),
        requiredMedicineIds: Array.isArray(payload.required_medicine_ids)
          ? payload.required_medicine_ids.map((value) => Number(value))
          : [],
        preferredRegion: payload.preferred_region ? String(payload.preferred_region) : undefined,
        maxDistanceKm: payload.max_distance_km ? Number(payload.max_distance_km) : undefined,
        notesFromSender: payload.notes_from_sender ? String(payload.notes_from_sender) : undefined
      });

      if (result.accepted && result.selectedCenter) {
        await enqueueCentralNotification(
          result.selectedCenter.id,
          "NOTIFY_REFERRAL",
          {
            referral_id: result.referral.id,
            patient_unified_id: result.referral.patient.unifiedId,
            required_specialty: result.referral.requiredSpecialty,
            priority: result.referral.priority,
            selected_center_reason: result.referral.selectedCenterReason
          },
          24
        );
      }

      await enqueueCentralNotification(notification.centerId, "NOTIFY_REFERRAL_RESPONSE", result.responsePayload, 24);

      await prisma.centerNotification.update({
        where: { id: centerNotification.id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          responseSent: true,
          notes: result.accepted
            ? `تمت مطابقة الإحالة مع ${result.selectedCenter?.centerName}.`
            : "رُفضت الإحالة لعدم توفر مركز مناسب."
        }
      });

      await prisma.outgoingNotification.update({
        where: { id: notification.id },
        data: {
          status: "COMPLETED",
          sentAt: new Date(),
          acknowledgedAt: new Date(),
          responsePayload: asJson(result.responsePayload),
          centralReferenceId: centerNotification.id
        }
      });

      await createProcessingLog({
        centerId: notification.centerId,
        outgoingNotificationId: notification.id,
        message: "تمت معالجة طلب الإحالة عبر المحرك المركزي للإحالات.",
        context: result.responsePayload
      });

      await createCommunicationLog({
        centerId: notification.centerId,
        direction: "FROM_CENTER",
        notificationType: "REFERRAL_REQUEST",
        status: "COMPLETED",
        requestPayload: payload,
        responsePayload: result.responsePayload
      });

      return;
    }

    const centerNotification = await prisma.centerNotification.create({
      data: {
        fromCenterId: notification.centerId,
        notificationType: notification.notificationType,
        payload: asJson(payload),
        status: "COMPLETED",
        processedAt: new Date(),
        responseSent: true,
        notes: "تم قبول الإشعار من قبل النظام المركزي."
      }
    });

    await prisma.outgoingNotification.update({
      where: { id: notification.id },
      data: {
        status: "COMPLETED",
        sentAt: new Date(),
        acknowledgedAt: new Date(),
        responsePayload: {
          status: "accepted"
        },
        centralReferenceId: centerNotification.id
      }
    });
  } catch (error) {
    await markRetryFailure(notification, error, async (data) => {
      await prisma.outgoingNotification.update({
        where: { id: notification.id },
        data: {
          retryCount: data.retryCount,
          status: data.status,
          nextRetryAt: data.nextRetryAt,
          lastError: data.lastError
        }
      });
    });

    await createProcessingLog({
      centerId: notification.centerId,
      outgoingNotificationId: notification.id,
      severity: "ERROR",
      message: "فشلت معالجة الإشعار الصادر.",
      context: {
        error: error instanceof Error ? error.message : "حدث خطأ غير معروف."
      }
    });
  }
}

export async function enqueueOutgoingNotification(
  centerId: number,
  notificationType: NetworkNotificationType,
  payload: Record<string, unknown>,
  maxRetries = 24
) {
  return prisma.outgoingNotification.create({
    data: {
      centerId,
      notificationType,
      payload: asJson(payload),
      maxRetries,
      nextRetryAt: new Date()
    }
  });
}

export async function enqueueCentralNotification(
  targetCenterId: number,
  notificationType: NetworkNotificationType,
  payload: Record<string, unknown>,
  maxRetries = 24
) {
  return prisma.centralNotification.create({
    data: {
      targetCenterId,
      notificationType,
      payload: asJson(payload),
      maxRetries,
      nextRetryAt: new Date()
    }
  });
}

export async function processOutgoingNotifications(centerId?: number) {
  const dueNotifications = await prisma.outgoingNotification.findMany({
    where: {
      ...(centerId ? { centerId } : {}),
      status: {
        in: ["PENDING", "FAILED"]
      },
      OR: [
        {
          nextRetryAt: null
        },
        {
          nextRetryAt: {
            lte: new Date()
          }
        }
      ]
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  for (const notification of dueNotifications) {
    await handleOutgoingNotification(notification.id);
  }

  return {
    processed: dueNotifications.length
  };
}

export async function processCentralNotifications(targetCenterId?: number) {
  const dueNotifications = await prisma.centralNotification.findMany({
    where: {
      ...(targetCenterId ? { targetCenterId } : {}),
      status: {
        in: ["PENDING", "FAILED"]
      },
      OR: [
        {
          nextRetryAt: null
        },
        {
          nextRetryAt: {
            lte: new Date()
          }
        }
      ]
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  for (const notification of dueNotifications) {
    await handleCentralNotification(notification.id);
  }

  return {
    processed: dueNotifications.length
  };
}

export async function syncCenterVisitsNow(centerId: number, daysBack = 7) {
  await enqueueCentralNotification(centerId, "REQUEST_NEW_VISITS", {
    from_date: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
    to_date: new Date().toISOString(),
    max_records: 200
  });

  return processCentralNotifications(centerId);
}

export async function processAllQueues() {
  const outgoing = await processOutgoingNotifications();
  const incoming = await processCentralNotifications();

  return {
    outgoing,
    incoming
  };
}

export function startNotificationProcessor(config: BackendSystemConfig) {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  setInterval(() => {
    if (config.workspace === "central") {
      processCentralNotifications().catch((error) => {
        console.error("خطأ في معالج إشعارات النظام المركزي:", error);
      });
      return;
    }

    if (!config.allowedCenterCode) {
      return;
    }

    prisma.centralCenter
      .findUnique({
        where: {
          centerCode: config.allowedCenterCode
        },
        select: {
          id: true
        }
      })
      .then((center) => {
        if (!center) {
          return;
        }

        return processOutgoingNotifications(center.id);
      })
      .catch((error) => {
        console.error("خطأ في معالج إشعارات المركز المحلي:", error);
      });
  }, 60_000);
}

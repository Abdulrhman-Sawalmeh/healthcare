import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import {
  followUpReminderInclude,
  mapFollowUpReminder,
  mapMedicationRefillRequest,
  refillRequestInclude
} from "./patient-care-workflow";
import { getPatientPortalAccount } from "./patient-accounts";

type TimelineEventType =
  | "appointment"
  | "diagnosis"
  | "prescription"
  | "lab_result"
  | "referral"
  | "refill_request"
  | "follow_up"
  | "note";

type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  description: string;
  date: string;
  createdBy: string;
  sourceTable: string;
  status?: string;
  source?: string;
};

type TimelineCenter = {
  centerId: number;
  centerCode: string;
  centerName: string;
};

const visitTypeLabels: Record<string, string> = {
  CONSULTATION: "استشارة",
  FOLLOW_UP: "متابعة",
  EMERGENCY: "طوارئ",
  LAB: "مختبر"
};

const referralStatusLabels: Record<string, string> = {
  AUTO_SELECTED: "اختيار آلي",
  PENDING_RECEIVING_MANAGER: "بانتظار قرار المدير",
  RECEIVING_MANAGER_ACCEPTED: "قبله المدير",
  RECEIVING_MANAGER_REJECTED: "رفضه المدير",
  ASSIGNED_TO_DOCTOR: "مسند إلى طبيب",
  VISIT_CREATED: "تم فتح زيارة",
  COMPLETED: "مكتملة",
  NO_CANDIDATE_REJECTED: "لا توجد جهة مناسبة",
  RETURNED_WITH_REASON: "معادة بسبب"
};

const labStatusLabels: Record<string, string> = {
  PENDING: "قيد الانتظار",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة"
};

const refillStatusLabels: Record<string, string> = {
  REQUESTED: "طلب جديد",
  DOCTOR_APPROVED: "وافق الطبيب",
  PHARMACY_PREPARING: "قيد التجهيز",
  READY_FOR_PICKUP: "جاهز للاستلام",
  COLLECTED: "تم الاستلام",
  REJECTED: "مرفوض"
};

const followUpStatusLabels: Record<string, string> = {
  PENDING: "قيد المتابعة",
  DONE: "منجز",
  CANCELLED: "ملغي",
  MISSED: "فائت"
};

function joinParts(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" • ");
}

function uniqueCenters(centers: TimelineCenter[]) {
  return centers.filter(
    (center, index, items) => items.findIndex((entry) => entry.centerId === center.centerId) === index
  );
}

function sortEvents(events: TimelineEvent[]) {
  return [...events].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function visitLabel(visitType: string) {
  return visitTypeLabels[visitType] ?? visitType;
}

function referralStatusLabel(status: string) {
  return referralStatusLabels[status] ?? status;
}

function labStatusLabel(status: string) {
  return labStatusLabels[status] ?? status;
}

function refillStatusLabel(status: string) {
  return refillStatusLabels[status] ?? status;
}

function followUpStatusLabel(status: string) {
  return followUpStatusLabels[status] ?? status;
}

export async function getPatientTimelineForCenter(centerId: number, patientId: number) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    include: {
      center: true,
      unifiedPatient: {
        include: {
          localPatients: {
            include: {
              center: true
            }
          }
        }
      },
      visits: {
        include: {
          center: true,
          doctor: true,
          prescriptions: true
        },
        orderBy: {
          visitDate: "desc"
        }
      },
      labRequests: {
        select: {
          id: true,
          requestDate: true,
          status: true,
          resultValue: true,
          resultDate: true,
          center: {
            select: {
              id: true,
              centerName: true
            }
          },
          doctor: {
            select: {
              id: true,
              fullName: true
            }
          },
          test: {
            select: {
              testName: true,
              category: true
            }
          }
        },
        orderBy: {
          requestDate: "desc"
        }
      },
      medicationRefillRequests: {
        include: refillRequestInclude,
        orderBy: {
          requestedAt: "desc"
        }
      },
      followUpReminders: {
        include: followUpReminderInclude,
        orderBy: {
          dueDate: "desc"
        }
      }
    }
  });

  if (!patient) {
    throw new AppError("لم يتم العثور على ملف المريض المطلوب داخل هذا المركز.", 404);
  }

  const referrals = patient.unifiedPatientId
    ? await prisma.centralReferral.findMany({
        where: {
          patientId: patient.unifiedPatientId
        },
        include: {
          fromCenter: true,
          toCenter: true
        },
        orderBy: {
          requestedAt: "desc"
        }
      })
    : [];

  const visitEvents = patient.visits.flatMap<TimelineEvent>((visit) => {
    const actor = visit.doctor?.fullName ?? visit.center.centerName;
    const visitDate = visit.visitDate.toISOString();
    const visitDetails = joinParts([
      `النوع: ${visitLabel(visit.visitType)}`,
      `المركز: ${visit.center.centerName}`,
      visit.visitTime ? `الوقت: ${visit.visitTime}` : null,
      visit.symptoms ? `الأعراض: ${visit.symptoms}` : null
    ]);

    return [
      {
        id: `appointment-${visit.id}`,
        type: "appointment",
        title: `موعد ${visitLabel(visit.visitType)}`,
        description: visitDetails,
        date: visitDate,
        createdBy: actor,
        sourceTable: "LocalVisit"
      },
      {
        id: `diagnosis-${visit.id}`,
        type: "diagnosis",
        title: `تشخيص: ${visit.diagnosis}`,
        description:
          joinParts([
            `الموعد: ${visitLabel(visit.visitType)}`,
            visit.bloodPressure ? `الضغط: ${visit.bloodPressure}` : null,
            visit.temperature ? `الحرارة: ${visit.temperature}` : null,
            visit.heartRate ? `النبض: ${visit.heartRate}` : null
          ]) || "تم تسجيل تشخيص سريري جديد.",
        date: visitDate,
        createdBy: actor,
        sourceTable: "LocalVisit"
      },
      ...(visit.notes
        ? [
            {
              id: `note-visit-${visit.id}`,
              type: "note" as const,
              title: "ملاحظة سريرية",
              description: visit.notes,
              date: visitDate,
              createdBy: actor,
              sourceTable: "LocalVisit"
            }
          ]
        : [])
    ];
  });

  const prescriptionEvents = patient.visits.flatMap<TimelineEvent>((visit) =>
    visit.prescriptions.map((prescription) => ({
      id: `prescription-${prescription.id}`,
      type: "prescription",
      title: `وصفة دوائية: ${prescription.medicineName}`,
      description:
        joinParts([
          `الجرعة: ${prescription.dosage}`,
          `المدة: ${prescription.duration}`,
          prescription.instructions ? `التعليمات: ${prescription.instructions}` : null
        ]) || "تمت إضافة وصفة دوائية.",
      date: visit.visitDate.toISOString(),
      createdBy: visit.doctor?.fullName ?? visit.center.centerName,
      sourceTable: "LocalPrescription"
    }))
  );

  const labEvents = patient.labRequests
    .filter((request) => request.resultValue || request.resultDate || request.status === "COMPLETED")
    .map<TimelineEvent>((request) => ({
      id: `lab-${request.id}`,
      type: "lab_result",
      title: `نتيجة فحص ${request.test.testName}`,
      description:
        joinParts([
          `الحالة: ${labStatusLabel(request.status)}`,
          request.resultValue ? `النتيجة: ${request.resultValue}` : null,
          `القسم: ${request.test.category}`
        ]) || "تم تحديث نتيجة فحص مخبري.",
      date: (request.resultDate ?? request.requestDate).toISOString(),
      createdBy: request.doctor.fullName,
      sourceTable: "LabRequestLocal"
    }));

  const referralEvents = referrals.flatMap<TimelineEvent>((referral) => {
    const targetCenter = referral.toCenter?.centerName ?? "بانتظار التوجيه";
    const requestedAt = referral.requestedAt.toISOString();

    return [
      {
        id: `referral-${referral.id}`,
        type: "referral",
        title: `إحالة إلى ${referral.requiredSpecialty}`,
        description:
          joinParts([
            `من ${referral.fromCenter.centerName}`,
            `إلى ${targetCenter}`,
            `الحالة: ${referralStatusLabel(referral.status)}`,
            referral.reason
          ]) || "تم إنشاء إحالة جديدة للمريض.",
        date: requestedAt,
        createdBy: referral.fromCenter.centerName,
        sourceTable: "CentralReferral",
        status: referral.status,
        source: "CentralReferral"
      },
      ...(referral.notesFromSender
        ? [
            {
              id: `note-referral-sender-${referral.id}`,
              type: "note" as const,
              title: "ملاحظات جهة الإحالة",
              description: referral.notesFromSender,
              date: requestedAt,
              createdBy: referral.fromCenter.centerName,
              sourceTable: "CentralReferral"
            }
          ]
        : []),
      ...(referral.notesFromReceiver
        ? [
            {
              id: `note-referral-receiver-${referral.id}`,
              type: "note" as const,
              title: "ملاحظات الجهة المستقبلة",
              description: referral.notesFromReceiver,
              date: (referral.respondedAt ?? referral.requestedAt).toISOString(),
              createdBy: referral.toCenter?.centerName ?? targetCenter,
              sourceTable: "CentralReferral"
            }
          ]
        : [])
    ];
  });

  const refillEvents = patient.medicationRefillRequests.map<TimelineEvent>((request) => ({
    id: `refill-${request.id}`,
    type: "refill_request",
    title: `طلب تجديد دواء: ${request.prescription.medicineName}`,
    description:
      joinParts([
        `الحالة: ${refillStatusLabel(request.status)}`,
        `الجرعة: ${request.prescription.dosage}`,
        `المدة: ${request.prescription.duration}`,
        request.rejectionReason ? `سبب الرفض: ${request.rejectionReason}` : null,
        request.notes ? `ملاحظات: ${request.notes}` : null
      ]) || "تم تسجيل طلب تجديد دواء للمريض.",
    date: request.updatedAt.toISOString(),
    createdBy: request.doctor?.fullName ?? request.prescription.visit.doctor?.fullName ?? patient.center.centerName,
    sourceTable: "MedicationRefillRequest",
    status: request.status,
    source: "MedicationRefillRequest"
  }));

  const followUpEvents = patient.followUpReminders.map<TimelineEvent>((reminder) => ({
    id: `follow-up-${reminder.id}`,
    type: "follow_up",
    title: `تذكير متابعة: ${reminder.reason}`,
    description:
      joinParts([
        `الحالة: ${followUpStatusLabel(reminder.status)}`,
        reminder.visit?.diagnosis ? `الزيارة: ${reminder.visit.diagnosis}` : null,
        reminder.notes ? `ملاحظات: ${reminder.notes}` : null
      ]) || "تم تسجيل تذكير متابعة للمريض.",
    date: reminder.dueDate.toISOString(),
    createdBy: reminder.doctor.fullName,
    sourceTable: "FollowUpReminder",
    status: reminder.status,
    source: "FollowUpReminder"
  }));

  const events = sortEvents([
    ...visitEvents,
    ...prescriptionEvents,
    ...labEvents,
    ...referralEvents,
    ...refillEvents,
    ...followUpEvents
  ]);
  const centersSeenAt = uniqueCenters(
    patient.unifiedPatient?.localPatients.length
      ? patient.unifiedPatient.localPatients.map((entry) => ({
          centerId: entry.center.id,
          centerCode: entry.center.centerCode,
          centerName: entry.center.centerName
        }))
      : [
          {
            centerId: patient.center.id,
            centerCode: patient.center.centerCode,
            centerName: patient.center.centerName
          }
        ]
  );
  const portalAccount = await getPatientPortalAccount({
    centerCode: patient.center.centerCode,
    nationalId: patient.unifiedPatient?.nationalId,
    primaryPhone: patient.phone
  });

  return {
    patient: {
      id: patient.id,
      fullName: patient.fullName,
      unifiedId: patient.unifiedId,
      nationalId: patient.unifiedPatient?.nationalId ?? null,
      email: portalAccount?.email ?? null,
      phone: patient.phone,
      gender: patient.gender,
      dateOfBirth: patient.dateOfBirth,
      address: patient.address,
      bloodType: patient.bloodType,
      emergencyContact: patient.emergencyContact,
      allergies: patient.allergies,
      chronicDiseases: patient.chronicDiseases,
      centersSeenAt,
      visitCount: patient.visits.length,
      labResultsCount: labEvents.length,
      referralCount: referrals.length,
      refillRequestCount: patient.medicationRefillRequests.length,
      followUpReminderCount: patient.followUpReminders.length,
      timelineCount: events.length,
      lastEventAt: events[0]?.date ?? null
    },
    events,
    refillRequests: patient.medicationRefillRequests.map(mapMedicationRefillRequest),
    followUpReminders: patient.followUpReminders.map(mapFollowUpReminder)
  };
}

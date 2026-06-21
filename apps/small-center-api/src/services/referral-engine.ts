import { NetworkReferralPriority, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { createInternalNotification } from "./internal-notifications";

export interface ReferralRequestInput {
  patientUnifiedId: string;
  requiredSpecialty: string;
  priority: NetworkReferralPriority;
  reason: string;
  requiresOr?: boolean;
  requiredMedicineIds?: number[];
  preferredRegion?: string;
  maxDistanceKm?: number;
  notesFromSender?: string;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function calculateScore(input: {
  distanceKm: number;
  availableDoctors: number;
  currentLoad: number;
  averageWaitTime: number;
  hasAvailableOr: boolean;
  priority: NetworkReferralPriority;
  matchedMedicineCount: number;
  requiredMedicineCount: number;
}) {
  let score = 0;

  score += Math.max(0, (100 - input.distanceKm) * 2);
  score += input.availableDoctors * 10;
  score += Math.max(0, (100 - input.currentLoad) * 3);
  score += Math.max(0, (60 - input.averageWaitTime) * 2);

  if ((input.priority === "URGENT" || input.priority === "EMERGENCY") && input.hasAvailableOr) {
    score += 50;
  }

  if (input.requiredMedicineCount > 0) {
    score += (input.matchedMedicineCount / input.requiredMedicineCount) * 50;
  }

  return Math.round(score);
}

export async function resolveReferralRequest(fromCenterId: number, input: ReferralRequestInput) {
  const patient = await prisma.unifiedPatient.findUnique({
    where: {
      unifiedId: input.patientUnifiedId
    }
  });

  if (!patient) {
    throw new AppError("لم يتم العثور على المريض في السجل الموحد لطلب الإحالة.", 404);
  }

  const sourceCenter = await prisma.centralCenter.findUnique({
    where: {
      id: fromCenterId
    }
  });

  if (!sourceCenter) {
    throw new AppError("لم يتم العثور على المركز المُحيل.", 404);
  }

  const requiredMedicineIds = input.requiredMedicineIds ?? [];
  const maxDistanceKm = input.maxDistanceKm ?? 80;

  const referral = await prisma.centralReferral.create({
    data: {
      fromCenterId,
      patientId: patient.id,
      requiredSpecialty: input.requiredSpecialty,
      priority: input.priority,
      reason: input.reason,
      status: "REQUESTED",
      requiresOr: input.requiresOr ?? false,
      requiredMedicineIds,
      preferredRegion: input.preferredRegion,
      maxDistanceKm,
      notesFromSender: input.notesFromSender
    }
  });

  const candidates = await prisma.centralCenter.findMany({
    where: {
      isConnected: true,
      id: {
        not: fromCenterId
      },
      specialties: {
        has: input.requiredSpecialty
      }
    },
    include: {
      doctorAvailability: {
        where: {
          specialty: input.requiredSpecialty
        }
      },
      operatingRoomStatus: true,
      medicineAvailability: requiredMedicineIds.length
        ? {
            where: {
              medicineId: {
                in: requiredMedicineIds
              }
            }
          }
        : true,
      loadSnapshots: true
    }
  });

  const scoredCandidates = candidates
    .map((candidate) => {
      const distanceKm = calculateDistanceKm(sourceCenter, candidate);
      const doctorAvailability = candidate.doctorAvailability[0];
      const loadSnapshot = candidate.loadSnapshots[0];
      const orStatus = candidate.operatingRoomStatus[0];
      const matchedMedicineCount = candidate.medicineAvailability.filter(
        (entry) => entry.isAvailable && entry.availableQuantity > 0
      ).length;

      const violatesRegion =
        input.preferredRegion &&
        candidate.region.toLowerCase() !== input.preferredRegion.toLowerCase() &&
        distanceKm > maxDistanceKm;

      if (
        violatesRegion ||
        distanceKm > maxDistanceKm ||
        !doctorAvailability ||
        doctorAvailability.availableDoctors <= 0 ||
        ((input.requiresOr ?? false) && (!orStatus || orStatus.availableRooms <= 0)) ||
        (requiredMedicineIds.length > 0 && matchedMedicineCount < requiredMedicineIds.length)
      ) {
        return null;
      }

      const averageWaitTime = loadSnapshot?.averageWaitTime ?? 60;
      const currentLoad = loadSnapshot?.currentPatientLoad ?? 100;
      const hasAvailableOr = (orStatus?.availableRooms ?? 0) > 0;
      const score = calculateScore({
        distanceKm,
        availableDoctors: doctorAvailability.availableDoctors,
        currentLoad,
        averageWaitTime,
        hasAvailableOr,
        priority: input.priority,
        matchedMedicineCount,
        requiredMedicineCount: requiredMedicineIds.length
      });

      return {
        candidate,
        distanceKm,
        availableDoctors: doctorAvailability.availableDoctors,
        currentLoad,
        averageWaitTime,
        score,
        hasAvailableOr
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b.score - a.score);

  if (scoredCandidates.length === 0) {
    const rejectedReferral = await prisma.centralReferral.update({
      where: { id: referral.id },
      data: {
        status: "NO_CANDIDATE_REJECTED",
        respondedAt: new Date(),
        rejectionReason:
          "لم يتوفر مركز متصل يطابق التخصص المطلوب ومعايير المسافة والتوافر والدواء المطلوب."
      },
      include: {
        fromCenter: true,
        toCenter: true,
        patient: true
      }
    });

    await Promise.all([
      createInternalNotification({
        centerId: fromCenterId,
        type: "REFERRAL_NO_CANDIDATE_REJECTED",
        title: "لم يتم العثور على مركز مناسب للإحالة",
        message: `تعذر توجيه إحالة ${patient.fullName} إلى ${input.requiredSpecialty}.`,
        severity: "WARNING"
      }),
      prisma.auditLog.create({
        data: {
          centerId: fromCenterId,
          actorUserId: "system",
          actorUsername: "central-referral-engine",
          actorRole: "SYSTEM",
          workspace: "central",
          action: "REFERRAL_NO_CANDIDATE_REJECTED",
          entityType: "CentralReferral",
          entityId: String(rejectedReferral.id),
          newValue: {
            status: rejectedReferral.status,
            requiredSpecialty: rejectedReferral.requiredSpecialty
          }
        }
      })
    ]);

    return {
      referral: rejectedReferral,
      accepted: false as const,
      responsePayload: {
        referral_id: rejectedReferral.id,
        status: "rejected",
        message:
          "لم يتم العثور على مركز مناسب. يوصى بتوسيع نطاق البحث أو تعديل درجة الاستعجال أو مراجعة قائمة الأدوية المطلوبة."
      }
    };
  }

  const best = scoredCandidates[0];
  const selectedCenterReason =
    `تم اختيار ${best.candidate.centerName} بدرجة ${best.score} اعتمادًا على مسافة ${best.distanceKm.toFixed(1)} كم، ` +
    `وتوفر ${best.availableDoctors} من الأطباء، وحمل تشغيلي قدره ${best.currentLoad}، ومتوسط انتظار ${best.averageWaitTime} دقيقة.`;

  const acceptedReferral = await prisma.centralReferral.update({
    where: { id: referral.id },
      data: {
        toCenterId: best.candidate.id,
        status: "PENDING_RECEIVING_MANAGER",
        respondedAt: new Date(),
        selectedCenterReason,
        estimatedWaitTimeMinutes: best.averageWaitTime,
        matchingScore: best.score
      },
    include: {
      fromCenter: true,
      toCenter: true,
      patient: true
    }
  });

  await Promise.all([
    createInternalNotification({
      centerId: fromCenterId,
      type: "REFERRAL_AUTO_SELECTED",
      title: "تم اختيار مركز استقبال للإحالة",
      message: `اختار المحرك ${best.candidate.centerName} لإحالة ${patient.fullName}. بانتظار قرار مدير المركز المستقبل. [[target:/referrals?referralId=${acceptedReferral.id}]]`,
      severity: "INFO"
    }),
    createInternalNotification({
      centerId: best.candidate.id,
      type: "REFERRAL_PENDING_MANAGER_REVIEW",
      title: "إحالة واردة بانتظار القرار",
      message: `إحالة ${patient.fullName} من ${sourceCenter.centerName} تحتاج قبولاً أو رفضاً من مدير المركز. [[target:/referrals?view=incoming&referralId=${acceptedReferral.id}]]`,
      severity: "INFO"
    }),
    prisma.auditLog.create({
      data: {
        centerId: fromCenterId,
        actorUserId: "system",
        actorUsername: "central-referral-engine",
        actorRole: "SYSTEM",
        workspace: "central",
        action: "REFERRAL_AUTO_SELECTED",
        entityType: "CentralReferral",
        entityId: String(acceptedReferral.id),
        newValue: {
          status: acceptedReferral.status,
          toCenterId: acceptedReferral.toCenterId,
          matchingScore: best.score
        }
      }
    })
  ]);

  return {
    referral: acceptedReferral,
    accepted: true as const,
    selectedCenter: best.candidate,
    score: best.score,
    responsePayload: {
      referral_id: acceptedReferral.id,
      status: "pending_receiving_manager",
      to_center: {
        id: best.candidate.id,
        center_code: best.candidate.centerCode,
        center_name: best.candidate.centerName,
        city: best.candidate.city,
        region: best.candidate.region
      },
      estimated_wait_time_minutes: best.averageWaitTime,
      selected_center_reason: selectedCenterReason
    }
  };
}

export type CentralReferralWithRelations = Prisma.CentralReferralGetPayload<{
  include: {
    fromCenter: true;
    toCenter: true;
    patient: true;
  };
}>;

import { Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";

export const pharmacyPrescriptionStatuses = [
  "NEW",
  "UNDER_REVIEW",
  "PREPARING",
  "READY_FOR_PICKUP",
  "DISPENSED",
  "UNAVAILABLE",
  "NEEDS_DOCTOR_REVIEW",
  "CANCELLED"
] as const;

export type PharmacyPrescriptionStatus = (typeof pharmacyPrescriptionStatuses)[number];

export const pharmacyAuditActions = [
  "PRESCRIPTION_RECEIVED",
  "PRESCRIPTION_VIEWED_BY_PHARMACIST",
  "PRESCRIPTION_PREPARATION_STARTED",
  "PRESCRIPTION_READY_FOR_PICKUP",
  "PRESCRIPTION_DISPENSED",
  "PRESCRIPTION_MEDICATION_UNAVAILABLE",
  "PRESCRIPTION_DOCTOR_REVIEW_REQUESTED",
  "PRESCRIPTION_DOCTOR_REVIEW_RESPONDED",
  "INVENTORY_LOW_STOCK",
  "INVENTORY_UPDATED",
  "PRESCRIPTION_VERIFIED"
] as const;

export const pharmacyPrescriptionInclude = {
  visit: {
    include: {
      patient: {
        select: {
          id: true,
          fullName: true,
          unifiedId: true,
          gender: true,
          dateOfBirth: true,
          allergies: true
        }
      },
      doctor: {
        select: {
          id: true,
          fullName: true
        }
      }
    }
  },
  dispensedBy: {
    select: {
      id: true,
      fullName: true
    }
  },
  warnings: {
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.LocalPrescriptionInclude;

export type PharmacyPrescriptionWithDetails = Prisma.LocalPrescriptionGetPayload<{
  include: typeof pharmacyPrescriptionInclude;
}>;

export function mapPharmacyPrescription(
  prescription: PharmacyPrescriptionWithDetails,
  inventory?: {
    id: number;
    quantity: number;
    unit: string;
    reorderLevel: number;
    updatedAt: Date;
  } | null
) {
  const patient = prescription.visit.patient;

  return {
    id: prescription.id,
    prescriptionCode: prescription.verificationCode ?? `RX-${prescription.id}`,
    visitId: prescription.visitId,
    patientId: patient.id,
    patientName: patient.fullName,
    patientFileNumber: patient.unifiedId ?? String(patient.id),
    patientGender: patient.gender,
    patientDateOfBirth: patient.dateOfBirth,
    patientAllergies: patient.allergies,
    doctorId: prescription.visit.doctorId,
    doctorName: prescription.visit.doctor?.fullName ?? "غير محدد",
    priority: prescription.visit.priority,
    issuedAt: prescription.issuedAt,
    medicineId: prescription.medicineId,
    medicineName: prescription.medicineName,
    dosage: prescription.dosage,
    duration: prescription.duration,
    quantity: prescription.quantity,
    instructions: prescription.instructions,
    status: prescription.pharmacyStatus as PharmacyPrescriptionStatus,
    availabilityStatus: prescription.availabilityStatus,
    pharmacistNotes: prescription.pharmacistNotes,
    unavailableReason: prescription.unavailableReason,
    doctorReviewReason: prescription.doctorReviewReason,
    doctorReviewResponse: prescription.doctorReviewResponse,
    preparationStartedAt: prescription.preparationStartedAt,
    readyForPickupAt: prescription.readyForPickupAt,
    doctorReviewRequestedAt: prescription.doctorReviewRequestedAt,
    doctorReviewedAt: prescription.doctorReviewedAt,
    dispensed: prescription.dispensed,
    dispensedAt: prescription.dispensedAt,
    dispensedByName: prescription.dispensedBy?.fullName ?? null,
    cancelledAt: prescription.cancelledAt,
    updatedAt: prescription.pharmacyUpdatedAt,
    inventory: inventory
      ? {
          id: inventory.id,
          quantity: inventory.quantity,
          unit: inventory.unit,
          reorderLevel: inventory.reorderLevel,
          isLowStock: inventory.quantity <= inventory.reorderLevel,
          updatedAt: inventory.updatedAt
        }
      : null,
    warnings: prescription.warnings.map((warning) => ({
      id: warning.id,
      type: warning.warningType,
      severity: warning.severity,
      message: warning.message,
      overridden: warning.overridden
    }))
  };
}

export async function getPharmacyPrescriptions(input: {
  centerId: number;
  status?: PharmacyPrescriptionStatus;
  doctorId?: number;
}) {
  const where: Prisma.LocalPrescriptionWhereInput = {
    visit: {
      centerId: input.centerId,
      ...(input.doctorId ? { doctorId: input.doctorId } : {})
    },
    ...(input.status ? { pharmacyStatus: input.status } : {})
  };
  const prescriptions = await prisma.localPrescription.findMany({
    where,
    include: pharmacyPrescriptionInclude,
    orderBy: [{ pharmacyUpdatedAt: "desc" }, { issuedAt: "desc" }]
  });
  const inventoryIds = prescriptions.flatMap((prescription) =>
    prescription.medicineId ? [prescription.medicineId] : []
  );
  const inventory = inventoryIds.length
    ? await prisma.pharmacyInventoryLocal.findMany({
        where: {
          centerId: input.centerId,
          id: {
            in: [...new Set(inventoryIds)]
          }
        }
      })
    : [];
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));

  return prescriptions.map((prescription) =>
    mapPharmacyPrescription(
      prescription,
      prescription.medicineId ? inventoryById.get(prescription.medicineId) ?? null : null
    )
  );
}

export async function getPharmacyDashboard(centerId: number) {
  const [prescriptions, inventory, recentAudit] = await Promise.all([
    getPharmacyPrescriptions({ centerId }),
    prisma.pharmacyInventoryLocal.findMany({
      where: { centerId },
      orderBy: [{ quantity: "asc" }, { medicineName: "asc" }]
    }),
    prisma.auditLog.findMany({
      where: {
        centerId,
        action: {
          in: [...pharmacyAuditActions]
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 8
    })
  ]);
  const today = new Date();
  const isToday = (value: string | Date | null | undefined) => {
    if (!value) return false;
    const date = new Date(value);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  };

  return {
    stats: {
      newPrescriptions: prescriptions.filter((item) => item.status === "NEW").length,
      waitingReview: prescriptions.filter((item) => item.status === "UNDER_REVIEW").length,
      preparing: prescriptions.filter((item) => item.status === "PREPARING").length,
      readyForPickup: prescriptions.filter((item) => item.status === "READY_FOR_PICKUP").length,
      dispensedToday: prescriptions.filter(
        (item) => item.status === "DISPENSED" && isToday(item.dispensedAt)
      ).length,
      unavailable: prescriptions.filter((item) => item.status === "UNAVAILABLE").length,
      needsDoctorReview: prescriptions.filter(
        (item) => item.status === "NEEDS_DOCTOR_REVIEW"
      ).length,
      lowStock: inventory.filter((item) => item.quantity <= item.reorderLevel).length
    },
    recentPrescriptions: prescriptions.slice(0, 8),
    recentActivity: recentAudit
  };
}

import {
  PrescriptionWarningSeverity,
  PrescriptionWarningType,
  Prisma
} from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

export type PrescriptionSafetyDraft = {
  medicineId?: number | null;
  medicineName: string;
};

export type PrescriptionSafetyWarning = {
  prescriptionIndex: number;
  medicineName: string;
  warningType: PrescriptionWarningType;
  severity: PrescriptionWarningSeverity;
  message: string;
  conflictWith?: string | null;
};

const allergyAliases: Record<string, string[]> = {
  penicillin: ["amoxicillin", "ampicillin", "cloxacillin", "flucloxacillin"],
  sulfa: ["sulfamethoxazole", "trimethoprim sulfamethoxazole", "co-trimoxazole"],
  aspirin: ["acetylsalicylic acid", "asa"],
  ibuprofen: ["nsaid", "naproxen", "diclofenac"],
  insulin: ["insulin glargine", "insulin lispro", "insulin aspart"]
};

function normalizeMedicationName(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function medicationMatches(left: string, right: string) {
  const first = normalizeMedicationName(left);
  const second = normalizeMedicationName(right);

  if (!first || !second) {
    return false;
  }

  return first === second || first.includes(second) || second.includes(first);
}

function allergyRelatedTerms(allergy: string) {
  const normalized = normalizeMedicationName(allergy);
  const aliases = allergyAliases[normalized] ?? [];

  return [normalized, ...aliases].filter((term) => term.length >= 3);
}

function warningKey(warning: PrescriptionSafetyWarning) {
  return [
    warning.prescriptionIndex,
    warning.warningType,
    warning.severity,
    normalizeMedicationName(warning.message)
  ].join(":");
}

export async function checkPrescriptionSafety(params: {
  centerId: number;
  patientId: number;
  prescriptions: PrescriptionSafetyDraft[];
  activeVisitId?: number;
}) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: params.patientId,
      centerId: params.centerId
    },
    select: {
      id: true,
      allergies: true
    }
  });

  if (!patient) {
    throw new AppError("Patient was not found in this center.", 404);
  }

  const drafts = params.prescriptions
    .map((prescription, index) => ({
      index,
      medicineName: prescription.medicineName.trim()
    }))
    .filter((prescription) => prescription.medicineName.length > 0);

  if (drafts.length === 0) {
    return [];
  }

  const [activePrescriptions, conflicts] = await Promise.all([
    prisma.localPrescription.findMany({
      where: {
        visit: {
          centerId: params.centerId,
          patientId: params.patientId,
          ...(params.activeVisitId ? { id: { not: params.activeVisitId } } : {})
        }
      },
      select: {
        medicineName: true,
        issuedAt: true
      },
      orderBy: {
        issuedAt: "desc"
      },
      take: 50
    }),
    prisma.drugConflict.findMany()
  ]);

  const warnings: PrescriptionSafetyWarning[] = [];

  for (const draft of drafts) {
    for (const allergy of patient.allergies) {
      const matchedTerm = allergyRelatedTerms(allergy).find((term) => medicationMatches(draft.medicineName, term));

      if (matchedTerm) {
        warnings.push({
          prescriptionIndex: draft.index,
          medicineName: draft.medicineName,
          warningType: "ALLERGY",
          severity: "HIGH",
          message: `Patient allergy "${allergy}" may be related to "${draft.medicineName}". Review before prescribing.`,
          conflictWith: allergy
        });
      }
    }
  }

  const activeMedicationNames = activePrescriptions.map((prescription) => prescription.medicineName);
  const newMedicationNames = drafts.map((draft) => draft.medicineName);

  for (const draft of drafts) {
    const comparisonNames = [
      ...activeMedicationNames,
      ...newMedicationNames.filter((name) => !medicationMatches(name, draft.medicineName))
    ];

    for (const conflict of conflicts) {
      const draftIsA = medicationMatches(draft.medicineName, conflict.medicationA);
      const draftIsB = medicationMatches(draft.medicineName, conflict.medicationB);

      if (!draftIsA && !draftIsB) {
        continue;
      }

      const oppositeName = draftIsA ? conflict.medicationB : conflict.medicationA;
      const matchedMedication = comparisonNames.find((name) => medicationMatches(name, oppositeName));

      if (!matchedMedication) {
        continue;
      }

      warnings.push({
        prescriptionIndex: draft.index,
        medicineName: draft.medicineName,
        warningType: "DRUG_CONFLICT",
        severity: conflict.severity,
        message: conflict.warningMessage,
        conflictWith: matchedMedication
      });
    }
  }

  const seen = new Set<string>();

  return warnings.filter((warning) => {
    const key = warningKey(warning);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function validatePrescriptionSafetyOverride(params: {
  warnings: PrescriptionSafetyWarning[];
  overrideWarnings?: boolean;
  overrideReason?: string | null;
}) {
  if (params.warnings.length === 0) {
    return;
  }

  if (!params.overrideWarnings) {
    throw new AppError("Prescription safety warnings require doctor confirmation before saving.", 409, {
      requiresOverride: true,
      warnings: params.warnings
    });
  }

  const hasHighSeverity = params.warnings.some((warning) => warning.severity === "HIGH");

  if (hasHighSeverity && !params.overrideReason?.trim()) {
    throw new AppError("High severity prescription warnings require an override reason.", 400, {
      requiresOverride: true,
      requiresOverrideReason: true,
      warnings: params.warnings
    });
  }
}

export async function savePrescriptionWarnings(
  tx: Prisma.TransactionClient,
  params: {
    patientId: number;
    prescriptionId: number;
    prescriptionIndex: number;
    warnings: PrescriptionSafetyWarning[];
    overridden: boolean;
    overrideReason?: string | null;
  }
) {
  const matchingWarnings = params.warnings.filter(
    (warning) => warning.prescriptionIndex === params.prescriptionIndex
  );

  if (matchingWarnings.length === 0) {
    return;
  }

  await tx.prescriptionWarning.createMany({
    data: matchingWarnings.map((warning) => ({
      patientId: params.patientId,
      prescriptionId: params.prescriptionId,
      warningType: warning.warningType,
      message: warning.message,
      severity: warning.severity,
      overridden: params.overridden,
      overrideReason: params.overrideReason?.trim() || undefined
    }))
  });
}

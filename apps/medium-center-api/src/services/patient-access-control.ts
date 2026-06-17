import {
  PatientConsent,
  PatientConsentScope,
  PatientConsentStatus,
  PatientConsentTargetType
} from "@prisma/client";

import { prisma } from "../lib/prisma";

const fullAccessScope: PatientConsentScope = "FULL_SUMMARY";

function targetId(value: string | number) {
  return String(value).trim();
}

function allowedScopes(scope: PatientConsentScope) {
  return scope === fullAccessScope ? [fullAccessScope] : [scope, fullAccessScope];
}

export async function expireStalePatientConsents(patientId?: number) {
  await prisma.patientConsent.updateMany({
    where: {
      ...(patientId ? { patientId } : {}),
      status: "ACTIVE",
      expiresAt: {
        lte: new Date()
      }
    },
    data: {
      status: "EXPIRED"
    }
  });
}

export async function hasPatientConsent(
  patientId: number,
  actorId: string | number,
  scope: PatientConsentScope
) {
  await expireStalePatientConsents(patientId);

  const consent = await prisma.patientConsent.findFirst({
    where: {
      patientId,
      targetType: "DOCTOR",
      targetId: targetId(actorId),
      scope: {
        in: allowedScopes(scope)
      },
      status: "ACTIVE",
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(consent);
}

export async function hasCenterConsent(
  patientId: number,
  centerId: string | number,
  scope: PatientConsentScope
) {
  await expireStalePatientConsents(patientId);

  const consent = await prisma.patientConsent.findFirst({
    where: {
      patientId,
      targetType: "CENTER",
      targetId: targetId(centerId),
      scope: {
        in: allowedScopes(scope)
      },
      status: "ACTIVE",
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(consent);
}

export async function hasActiveEmergencyAccess(patientId: number, doctorId: string | number) {
  const access = await prisma.emergencyAccess.findFirst({
    where: {
      patientId,
      doctorId: Number(doctorId),
      revokedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      id: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return Boolean(access);
}

export function mapPatientConsent(
  consent: PatientConsent,
  targetLabel?: string | null
) {
  const isExpired = consent.status === "ACTIVE" && consent.expiresAt <= new Date();
  const status: PatientConsentStatus = isExpired ? "EXPIRED" : consent.status;

  return {
    id: consent.id,
    patientId: consent.patientId,
    targetType: consent.targetType,
    targetId: consent.targetId,
    targetLabel: targetLabel ?? null,
    scope: consent.scope,
    status,
    expiresAt: consent.expiresAt,
    revokedAt: consent.revokedAt,
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt
  };
}

export async function resolveConsentTargetLabel(
  targetType: PatientConsentTargetType,
  target: string
) {
  const parsedId = Number(target);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return null;
  }

  if (targetType === "DOCTOR") {
    const doctor = await prisma.centerUserAccount.findFirst({
      where: {
        id: parsedId,
        role: "DOCTOR",
        isActive: true
      },
      include: {
        center: {
          select: {
            centerName: true
          }
        }
      }
    });

    return doctor ? `${doctor.fullName} - ${doctor.center.centerName}` : null;
  }

  const center = await prisma.centralCenter.findFirst({
    where: {
      id: parsedId,
      isConnected: true
    },
    select: {
      centerName: true,
      centerCode: true
    }
  });

  return center ? `${center.centerName} (${center.centerCode})` : null;
}

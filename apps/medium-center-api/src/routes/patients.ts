import { PatientConsentScope, UserRole } from "@prisma/client";
import { Request, Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { getPatientTimelineForCenter } from "../services/patient-timeline";
import { getPatientLabTrend } from "../services/lab-trends";
import { resolvePortalLocalPatient } from "../services/patient-care-workflow";
import { buildPatientSummaryPdf } from "../services/patient-summary-export";
import { recordAuditLog } from "../services/audit-log";
import { notifyRole } from "../services/internal-notifications";
import {
  hasActiveEmergencyAccess,
  hasCenterConsent,
  hasPatientConsent
} from "../services/patient-access-control";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../middleware/error";
import { getSingleParam } from "../utils/request";
import { mapPatient } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

const accessScopeSchema = z.enum([
  "BASIC_INFO",
  "VISITS",
  "LAB_RESULTS",
  "PRESCRIPTIONS",
  "FULL_SUMMARY"
]);

const emergencyAccessSchema = z.object({
  reason: z.string().trim().min(10).max(1000)
});

function parsePatientId(value: string | string[] | undefined) {
  const patientId = Number(getSingleParam(value, "Patient ID"));

  if (!Number.isInteger(patientId) || patientId <= 0) {
    throw new AppError("Patient ID must be a positive integer.", 400);
  }

  return patientId;
}

async function resolvePatientAccess(req: Request, patientId: number, scope: PatientConsentScope) {
  if (req.auth?.role === UserRole.PATIENT) {
    const patientProfileId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
    const scope = await resolvePortalLocalPatient(patientProfileId);

    if (!scope?.centerId || !scope.localPatient || scope.localPatient.id !== patientId) {
      throw new AppError("You can only access your own patient summary.", 403);
    }

    return {
      centerId: scope.centerId,
      patientId: scope.localPatient.id,
      accessType: "SELF" as const
    };
  }

  const actorCenterId = Number(req.auth?.centerId);

  if (!actorCenterId) {
    throw new AppError("Center scope is required to access patient records.", 403);
  }

  const patient = await prisma.localPatient.findUnique({
    where: {
      id: patientId
    },
    select: {
      id: true,
      centerId: true
    }
  });

  if (!patient) {
    throw new AppError("Patient was not found in this center.", 404);
  }

  if (patient.centerId === actorCenterId) {
    return {
      centerId: patient.centerId,
      patientId: patient.id,
      accessType: "NORMAL_SCOPE" as const
    };
  }

  if (await hasCenterConsent(patientId, actorCenterId, scope)) {
    return {
      centerId: patient.centerId,
      patientId: patient.id,
      accessType: "CENTER_CONSENT" as const
    };
  }

  const actorId = Number(req.auth?.sub);

  if (Number.isInteger(actorId) && actorId > 0 && (await hasPatientConsent(patientId, actorId, scope))) {
    return {
      centerId: patient.centerId,
      patientId: patient.id,
      accessType: "DOCTOR_CONSENT" as const
    };
  }

  if (
    req.auth?.role === "DOCTOR" &&
    Number.isInteger(actorId) &&
    actorId > 0 &&
    (await hasActiveEmergencyAccess(patientId, actorId))
  ) {
    return {
      centerId: patient.centerId,
      patientId: patient.id,
      accessType: "EMERGENCY_ACCESS" as const
    };
  }

  throw new AppError("Patient consent is required to access this record.", 403, {
    code: "CONSENT_REQUIRED",
    scope,
    patientId,
    canRequestEmergencyAccess: req.auth?.role === "DOCTOR"
  });
}

router.get(
  "/:patientId/access-check",
  authenticate,
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const scope = accessScopeSchema.parse(req.query.scope ?? "FULL_SUMMARY");

    try {
      const access = await resolvePatientAccess(req, patientId, scope);
      return res.json({
        hasAccess: true,
        accessType: access.accessType,
        scope
      });
    } catch (error) {
      if (error instanceof AppError && error.statusCode === 403) {
        return res.json({
          hasAccess: false,
          scope,
          reason: "CONSENT_REQUIRED",
          canRequestEmergencyAccess: req.auth?.role === "DOCTOR"
        });
      }

      throw error;
    }
  })
);

router.post(
  "/:patientId/emergency-access",
  authenticate,
  authorize("DOCTOR"),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const payload = emergencyAccessSchema.parse(req.body);
    const doctorId = Number(req.auth?.sub);

    if (!Number.isInteger(doctorId) || doctorId <= 0) {
      throw new AppError("Doctor session is invalid.", 401);
    }

    const patient = await prisma.localPatient.findUnique({
      where: {
        id: patientId
      },
      select: {
        id: true,
        centerId: true,
        fullName: true
      }
    });

    if (!patient) {
      throw new AppError("Patient was not found.", 404);
    }

    if (Number(req.auth?.centerId) === patient.centerId) {
      throw new AppError("This doctor already has normal center access to this patient.", 409);
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const access = await prisma.emergencyAccess.create({
      data: {
        centerId: patient.centerId,
        patientId: patient.id,
        doctorId,
        reason: payload.reason,
        expiresAt
      }
    });

    await recordAuditLog(req, {
      action: "BREAK_GLASS_ACCESS_GRANTED",
      entityType: "EmergencyAccess",
      entityId: access.id,
      centerId: patient.centerId,
      newValue: {
        patientId: patient.id,
        doctorId,
        reason: payload.reason,
        expiresAt: expiresAt.toISOString()
      }
    });

    await notifyRole({
      centerId: patient.centerId,
      role: "CENTER_MANAGER",
      type: "BREAK_GLASS_ACCESS_GRANTED",
      title: "Emergency patient access granted",
      message: `Doctor ${req.auth?.username ?? doctorId} requested emergency access to ${patient.fullName}.`,
      severity: "WARNING"
    });

    res.status(201).json({
      id: access.id,
      patientId: patient.id,
      doctorId,
      expiresAt,
      createdAt: access.createdAt
    });
  })
);

router.get(
  "/:patientId/summary/export",
  authenticate,
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE", UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const access = await resolvePatientAccess(req, patientId, "FULL_SUMMARY");
    const summary = await buildPatientSummaryPdf(access.centerId, access.patientId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${summary.fileName}"`);
    res.send(summary.buffer);
  })
);

router.get(
  "/:patientId/lab-trends",
  authenticate,
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE", "LAB_TECH", UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const access = await resolvePatientAccess(req, patientId, "LAB_RESULTS");
    const testName = typeof req.query.testName === "string" ? req.query.testName : undefined;

    res.json(await getPatientLabTrend(access.centerId, access.patientId, testName));
  })
);

router.get(
  "/:patientId/timeline",
  authenticate,
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST", "NURSE", "LAB_TECH", "PHARMACIST"),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const access = await resolvePatientAccess(req, patientId, "FULL_SUMMARY");

    res.json(await getPatientTimelineForCenter(access.centerId, access.patientId));
  })
);

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    if (req.auth?.role === UserRole.PATIENT) {
      const patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
      const patient = await prisma.patientProfile.findUnique({
        where: { id: patientId },
        include: {
          user: true,
          center: true,
          appointments: true,
          referrals: true
        }
      });

      return res.json(patient ? [mapPatient(patient)] : []);
    }

    const centerId = resolveCenterScope(
      req,
      typeof req.query.centerId === "string" ? req.query.centerId : undefined
    );
    const patients = await prisma.patientProfile.findMany({
      where: centerId ? { centerId } : undefined,
      include: {
        user: true,
        center: true,
        appointments: true,
        referrals: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return res.json(patients.map(mapPatient));
  })
);

export const patientsRouter = router;

import { UserRole } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { getPatientTimelineForCenter } from "../services/patient-timeline";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../middleware/error";
import { getSingleParam } from "../utils/request";
import { mapPatient } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

function parsePatientId(value: string | string[] | undefined) {
  const patientId = Number(getSingleParam(value, "Patient ID"));

  if (!Number.isInteger(patientId) || patientId <= 0) {
    throw new AppError("Patient ID must be a positive integer.", 400);
  }

  return patientId;
}

router.get(
  "/:patientId/timeline",
  authenticate,
  authorize("CENTER_MANAGER", "DOCTOR", "RECEPTIONIST"),
  asyncHandler(async (req, res) => {
    const patientId = parsePatientId(req.params.patientId);
    const centerId = Number(req.auth?.centerId);

    if (!centerId) {
      throw new AppError("Center scope is required to access patient timelines.", 403);
    }

    res.json(await getPatientTimelineForCenter(centerId, patientId));
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

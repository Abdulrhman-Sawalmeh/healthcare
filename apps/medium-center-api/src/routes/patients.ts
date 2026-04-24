import { UserRole } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { mapPatient } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

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

import { Prisma, ReferralStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapReferral } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

const createReferralSchema = z.object({
  fromCenterId: z.string().uuid().optional(),
  toCenterId: z.string().uuid(),
  patientId: z.string().uuid(),
  fromDoctorId: z.string().uuid().optional(),
  toDoctorId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  reason: z.string().min(5),
  notes: z.string().optional(),
  priority: z.string().default("MEDIUM")
});

const updateReferralSchema = z.object({
  status: z.nativeEnum(ReferralStatus),
  notes: z.string().optional()
});

const referralInclude = {
  fromCenter: true,
  toCenter: true,
  patient: {
    include: {
      user: true
    }
  },
  fromDoctor: {
    include: {
      user: true
    }
  },
  toDoctor: {
    include: {
      user: true
    }
  },
  department: true
} as const;

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const queryCenterId = typeof req.query.centerId === "string" ? req.query.centerId : undefined;
    const centerId = resolveCenterScope(req, queryCenterId);
    const where: Prisma.ReferralWhereInput = {};

    if (req.auth?.role === UserRole.PATIENT) {
      where.patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
    } else if (req.auth?.role === UserRole.DOCTOR) {
      const doctorId = requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.");
      where.OR = [{ fromDoctorId: doctorId }, { toDoctorId: doctorId }];
    } else if (centerId) {
      where.OR = [{ fromCenterId: centerId }, { toCenterId: centerId }];
    }

    const referrals = await prisma.referral.findMany({
      where,
      include: referralInclude,
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(referrals.map(mapReferral));
  })
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR),
  asyncHandler(async (req, res) => {
    const payload = createReferralSchema.parse(req.body);
    const fromCenterId = resolveCenterScope(req, payload.fromCenterId);

    if (!fromCenterId) {
      throw new AppError("A source center is required.", 400);
    }

    const fromDoctorId =
      req.auth?.role === UserRole.DOCTOR
        ? requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.")
        : payload.fromDoctorId;

    if (!fromDoctorId) {
      throw new AppError("A referring doctor is required.", 400);
    }

    const referral = await prisma.referral.create({
      data: {
        fromCenterId,
        toCenterId: payload.toCenterId,
        patientId: payload.patientId,
        fromDoctorId,
        toDoctorId: payload.toDoctorId,
        departmentId: payload.departmentId,
        reason: payload.reason,
        notes: payload.notes,
        priority: payload.priority
      },
      include: referralInclude
    });

    res.status(201).json(mapReferral(referral));
  })
);

router.patch(
  "/:referralId/status",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR),
  asyncHandler(async (req, res) => {
    const payload = updateReferralSchema.parse(req.body);
    const referralId = getSingleParam(req.params.referralId, "Referral ID");
    const existing = await prisma.referral.findUnique({
      where: { id: referralId }
    });

    if (!existing) {
      throw new AppError("Referral not found.", 404);
    }

    if (req.auth?.role === UserRole.DOCTOR) {
      const doctorId = requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.");
      if (existing.fromDoctorId !== doctorId && existing.toDoctorId !== doctorId) {
        throw new AppError("You can only update referrals linked to you.", 403);
      }
    }

    const referral = await prisma.referral.update({
      where: { id: existing.id },
      data: {
        status: payload.status,
        notes: payload.notes ?? existing.notes,
        acceptedAt:
          payload.status === ReferralStatus.ACCEPTED && !existing.acceptedAt
            ? new Date()
            : existing.acceptedAt,
        completedAt:
          payload.status === ReferralStatus.COMPLETED && !existing.completedAt
            ? new Date()
            : existing.completedAt
      },
      include: referralInclude
    });

    res.json(mapReferral(referral));
  })
);

export const referralsRouter = router;

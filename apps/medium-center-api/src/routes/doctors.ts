import { UserRole } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { mapDoctor } from "../utils/serializers";
import { resolveCenterScope } from "../utils/scope";

const router = Router();

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const centerId = resolveCenterScope(
      req,
      typeof req.query.centerId === "string" ? req.query.centerId : undefined
    );
    const doctors = await prisma.doctorProfile.findMany({
      where: centerId ? { centerId } : undefined,
      include: {
        user: true,
        center: true,
        department: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(doctors.map(mapDoctor));
  })
);

export const doctorsRouter = router;

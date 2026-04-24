import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (_req, res) => {
    const centers = await prisma.center.findMany({
      include: {
        departments: true,
        doctors: {
          include: {
            user: true,
            department: true
          }
        },
        subscriptionPlans: true
      },
      orderBy: {
        name: "asc"
      }
    });

    res.json(
      centers.map((center) => ({
        id: center.id,
        name: center.name,
        code: center.code,
        city: center.city,
        address: center.address,
        phone: center.phone,
        email: center.email,
        description: center.description,
        departments: center.departments.map((department) => ({
          id: department.id,
          name: department.name,
          floor: department.floor
        })),
        doctors: center.doctors.map((doctor) => ({
          id: doctor.id,
          fullName: doctor.user.fullName,
          specialization: doctor.specialization,
          departmentName: doctor.department.name
        })),
        subscriptionPlans: center.subscriptionPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          billingCycle: plan.billingCycle,
          priceInCents: plan.priceInCents,
          maxVisits: plan.maxVisits
        }))
      }))
    );
  })
);

export const centersRouter = router;

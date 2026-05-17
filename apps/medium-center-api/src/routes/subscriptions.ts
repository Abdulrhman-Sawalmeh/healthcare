import { PaymentStatus, Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapSubscription } from "../utils/serializers";
import { requireProfileId, resolveCenterScope } from "../utils/scope";

const router = Router();

const createSubscriptionSchema = z.object({
  centerId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  planId: z.string().uuid(),
  startedAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  autoRenew: z.boolean().default(true)
});

const createPaymentSchema = z.object({
  amountInCents: z.number().int().positive(),
  currency: z.string().default("USD"),
  method: z.string().default("CARD")
});

const activateSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  securePaymentToken: z.string().min(12),
  autoRenew: z.boolean().default(true),
  method: z.string().default("SECURE_CARD")
});

const subscriptionInclude = {
  center: true,
  plan: true,
  patient: {
    include: {
      user: true
    }
  },
  payments: {
    orderBy: {
      createdAt: "desc"
    }
  }
} as const;

router.get(
  "/",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const where: Prisma.SubscriptionWhereInput = {};

    if (req.auth?.role === UserRole.PATIENT) {
      where.patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
    } else {
      const centerId = resolveCenterScope(
        req,
        typeof req.query.centerId === "string" ? req.query.centerId : undefined
      );
      if (centerId) {
        where.centerId = centerId;
      }
    }

    const subscriptions = await prisma.subscription.findMany({
      where,
      include: subscriptionInclude,
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(subscriptions.map(mapSubscription));
  })
);

router.get(
  "/plans",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const centerId =
      req.auth?.role === UserRole.PATIENT
        ? (
            await prisma.patientProfile.findUnique({
              where: {
                id: requireProfileId(req.auth.patientProfileId, "Patient profile is required.")
              },
              select: {
                centerId: true
              }
            })
          )?.centerId
        : resolveCenterScope(
            req,
            typeof req.query.centerId === "string" ? req.query.centerId : undefined
          );

    if (!centerId) {
      throw new AppError("A center is required to list subscription plans.", 400);
    }

    const plans = await prisma.subscriptionPlan.findMany({
      where: { centerId },
      orderBy: [{ priceInCents: "asc" }, { name: "asc" }]
    });

    res.json(plans);
  })
);

router.post(
  "/",
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(async (req, res) => {
    const payload = createSubscriptionSchema.parse(req.body);
    const centerId = resolveCenterScope(req, payload.centerId);

    if (!centerId) {
      throw new AppError("A center is required to create a subscription.", 400);
    }

    const subscription = await prisma.subscription.create({
      data: {
        patientId: payload.patientId,
        centerId,
        planId: payload.planId,
        status: SubscriptionStatus.ACTIVE,
        startedAt: payload.startedAt,
        endsAt: payload.endsAt,
        autoRenew: payload.autoRenew
      },
      include: subscriptionInclude
    });

    res.status(201).json(mapSubscription(subscription));
  })
);

router.post(
  "/activate",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = activateSubscriptionSchema.parse(req.body);
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");
    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { centerId: true }
    });

    if (!patient) {
      throw new AppError("Patient profile not found.", 404);
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        id: payload.planId,
        centerId: patient.centerId
      }
    });

    if (!plan) {
      throw new AppError("Subscription plan not found for this center.", 404);
    }

    const now = new Date();
    const endsAt = new Date(now);
    if (plan.billingCycle === "YEARLY") {
      endsAt.setFullYear(endsAt.getFullYear() + 1);
    } else if (plan.billingCycle === "QUARTERLY") {
      endsAt.setMonth(endsAt.getMonth() + 3);
    } else {
      endsAt.setMonth(endsAt.getMonth() + 1);
    }

    const subscription = await prisma.subscription.create({
      data: {
        patientId,
        centerId: patient.centerId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: now,
        endsAt,
        autoRenew: payload.autoRenew,
        payments: {
          create: {
            amountInCents: plan.priceInCents,
            currency: "ILS",
            status: PaymentStatus.PAID,
            method: payload.method,
            reference: `SEC-${Date.now()}`,
            paidAt: now
          }
        }
      },
      include: subscriptionInclude
    });

    await prisma.notification.create({
      data: {
        userId: req.auth!.sub,
        title: "Subscription activated",
        body: "Your follow-up reminders and doctor messaging subscription is now active.",
        type: "PAYMENT"
      }
    });

    res.status(201).json(mapSubscription(subscription));
  })
);

router.post(
  "/:subscriptionId/payments",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = createPaymentSchema.parse(req.body);
    const subscriptionId = getSingleParam(req.params.subscriptionId, "Subscription ID");
    const subscription = await prisma.subscription.findUnique({
      where: {
        id: subscriptionId
      }
    });

    if (!subscription) {
      throw new AppError("Subscription not found.", 404);
    }

    if (req.auth?.role === UserRole.PATIENT) {
      const patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
      if (subscription.patientId !== patientId) {
        throw new AppError("You can only pay for your own subscription.", 403);
      }
    }

    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        amountInCents: payload.amountInCents,
        currency: payload.currency,
        status: PaymentStatus.PAID,
        method: payload.method,
        reference: `PAY-${Date.now()}`,
        paidAt: new Date()
      }
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.ACTIVE }
    });

    const updated = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: subscriptionInclude
    });

    res.status(201).json(updated ? mapSubscription(updated) : null);
  })
);

export const subscriptionsRouter = router;

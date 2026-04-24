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

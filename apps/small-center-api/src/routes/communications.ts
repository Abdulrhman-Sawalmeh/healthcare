import { Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { resolvePortalActor } from "../services/portal-identity";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapThread } from "../utils/serializers";

const router = Router();

const createThreadSchema = z.object({
  patientId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  initialMessage: z.string().min(2)
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000)
});

const threadInclude = {
  patient: {
    include: {
      user: true
    }
  },
  doctor: {
    include: {
      user: true,
      department: true
    }
  },
  messages: {
    include: {
      sender: true
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} as const;

function assertThreadAccess(
  thread: {
    patientId: string;
    doctorId: string;
  },
  actor: Awaited<ReturnType<typeof resolvePortalActor>>
) {
  if (actor.role === UserRole.PATIENT && thread.patientId !== actor.patientProfileId) {
    throw new AppError("You cannot access another patient's thread.", 403);
  }

  if (actor.role === UserRole.DOCTOR && thread.doctorId !== actor.doctorProfileId) {
    throw new AppError("You cannot access another doctor's thread.", 403);
  }
}

async function touchThread(threadId: string) {
  await prisma.messageThread.update({
    where: { id: threadId },
    data: {
      updatedAt: new Date()
    }
  });
}

async function createMessageNotification(userId: string) {
  await prisma.notification.create({
    data: {
      userId,
      title: "رسالة طبية جديدة",
      body: "وصلتك رسالة جديدة ضمن المحادثة الطبية الآمنة.",
      type: "MESSAGE"
    }
  });
}

async function assertPatientMessagingSubscription(actor: Awaited<ReturnType<typeof resolvePortalActor>>) {
  if (actor.role !== UserRole.PATIENT) {
    return;
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      patientId: actor.patientProfileId,
      status: SubscriptionStatus.ACTIVE,
      endsAt: {
        gte: new Date()
      }
    },
    select: {
      id: true
    }
  });

  if (!activeSubscription) {
    throw new AppError("Doctor messaging is available after activating a patient subscription.", 402);
  }
}

router.get(
  "/threads",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const where: Prisma.MessageThreadWhereInput = {};

    if (req.auth?.role === UserRole.PATIENT || req.auth?.role === UserRole.DOCTOR) {
      const actor = await resolvePortalActor(req.auth);

      if (actor.role === UserRole.PATIENT) {
        where.patientId = actor.patientProfileId;
      }

      if (actor.role === UserRole.DOCTOR) {
        where.doctorId = actor.doctorProfileId;
      }
    }

    if (req.auth?.role === UserRole.ADMIN && req.auth.centerId) {
      where.doctor = {
        is: {
          centerId: req.auth.centerId
        }
      };
    }

    const threads = await prisma.messageThread.findMany({
      where,
      include: threadInclude,
      orderBy: {
        updatedAt: "desc"
      }
    });

    res.json(threads.map(mapThread));
  })
);

router.post(
  "/threads",
  authenticate,
  authorize(UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const payload = createThreadSchema.parse(req.body);
    const actor = await resolvePortalActor(req.auth!);
    await assertPatientMessagingSubscription(actor);

    const patientId = actor.role === UserRole.PATIENT ? actor.patientProfileId : payload.patientId;
    const doctorId = actor.role === UserRole.DOCTOR ? actor.doctorProfileId : payload.doctorId;

    if (!patientId || !doctorId) {
      throw new AppError("Doctor and patient are required to start a thread.", 400);
    }

    const thread = await prisma.messageThread.upsert({
      where: {
        patientId_doctorId: {
          patientId,
          doctorId
        }
      },
      update: {},
      create: {
        patientId,
        doctorId
      }
    });

    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: actor.userId,
        content: payload.initialMessage
      }
    });
    await touchThread(thread.id);

    const updatedThread = await prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude
    });

    if (updatedThread) {
      const recipientUserId =
        actor.role === UserRole.PATIENT ? updatedThread.doctor.userId : updatedThread.patient.userId;
      await createMessageNotification(recipientUserId);
    }

    res.status(201).json(updatedThread ? mapThread(updatedThread) : null);
  })
);

router.post(
  "/threads/:threadId/messages",
  authenticate,
  authorize(UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const { content } = sendMessageSchema.parse(req.body);
    const threadId = getSingleParam(req.params.threadId, "Thread ID");
    const actor = await resolvePortalActor(req.auth!);
    await assertPatientMessagingSubscription(actor);
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        patient: {
          include: {
            user: true
          }
        },
        doctor: {
          include: {
            user: true
          }
        }
      }
    });

    if (!thread) {
      throw new AppError("Thread not found.", 404);
    }

    assertThreadAccess(thread, actor);

    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: actor.userId,
        content
      }
    });
    await touchThread(thread.id);

    const recipientUserId =
      actor.role === UserRole.PATIENT ? thread.doctor.userId : thread.patient.userId;
    await createMessageNotification(recipientUserId);

    const updatedThread = await prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude
    });

    res.json(updatedThread ? mapThread(updatedThread) : null);
  })
);

router.patch(
  "/threads/:threadId/read",
  authenticate,
  authorize(UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const threadId = getSingleParam(req.params.threadId, "Thread ID");
    const actor = await resolvePortalActor(req.auth!);
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId }
    });

    if (!thread) {
      throw new AppError("Thread not found.", 404);
    }

    assertThreadAccess(thread, actor);

    await prisma.message.updateMany({
      where: {
        threadId: thread.id,
        senderId: {
          not: actor.userId
        },
        isRead: false
      },
      data: {
        isRead: true
      }
    });

    const updatedThread = await prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude
    });

    res.json(updatedThread ? mapThread(updatedThread) : null);
  })
);

export const communicationsRouter = router;

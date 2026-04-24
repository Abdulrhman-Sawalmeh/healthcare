import { Prisma, UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapThread } from "../utils/serializers";
import { requireProfileId } from "../utils/scope";

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

router.get(
  "/threads",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const where: Prisma.MessageThreadWhereInput = {};

    if (req.auth?.role === UserRole.PATIENT) {
      where.patientId = requireProfileId(req.auth.patientProfileId, "Patient profile is required.");
    }

    if (req.auth?.role === UserRole.DOCTOR) {
      where.doctorId = requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.");
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

    const patientId =
      req.auth?.role === UserRole.PATIENT
        ? requireProfileId(req.auth.patientProfileId, "Patient profile is required.")
        : payload.patientId;
    const doctorId =
      req.auth?.role === UserRole.DOCTOR
        ? requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.")
        : payload.doctorId;

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
        senderId: req.auth!.sub,
        content: payload.initialMessage
      }
    });

    const updatedThread = await prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude
    });

    res.status(201).json(updatedThread ? mapThread(updatedThread) : null);
  })
);

router.post(
  "/threads/:threadId/messages",
  authenticate,
  authorize(UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const { content } = sendMessageSchema.parse(req.body);
    const threadId = getSingleParam(req.params.threadId, "Thread ID");
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

    if (
      req.auth?.role === UserRole.PATIENT &&
      thread.patientId !== requireProfileId(req.auth.patientProfileId, "Patient profile is required.")
    ) {
      throw new AppError("You cannot post to another patient's thread.", 403);
    }

    if (
      req.auth?.role === UserRole.DOCTOR &&
      thread.doctorId !== requireProfileId(req.auth.doctorProfileId, "Doctor profile is required.")
    ) {
      throw new AppError("You cannot post to another doctor's thread.", 403);
    }

    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: req.auth!.sub,
        content
      }
    });

    const recipientUserId =
      req.auth?.role === UserRole.PATIENT ? thread.doctor.userId : thread.patient.userId;

    await prisma.notification.create({
      data: {
        userId: recipientUserId,
        title: "New secure message",
        body: "You received a new message in the care coordination chat.",
        type: "MESSAGE"
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

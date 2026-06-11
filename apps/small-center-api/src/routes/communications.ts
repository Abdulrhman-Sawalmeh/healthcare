import { MessageThreadStatus, Prisma, SubscriptionStatus, UserRole } from "@prisma/client";
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
  initialMessage: z.string().trim().min(2).optional()
});

const messageAttachmentSchema = z.object({
  fileName: z.string().min(1).max(160),
  mimeType: z.string().min(3).max(120),
  contentBase64: z.string().min(1).max(4_800_000),
  sizeBytes: z.number().int().min(1).max(3_500_000)
});

const sendMessageSchema = z
  .object({
    content: z.string().trim().max(2000).default(""),
    attachment: messageAttachmentSchema.optional()
  })
  .refine((payload) => payload.content.length > 0 || Boolean(payload.attachment), {
    message: "Message content or an attachment is required."
  });

const threadStatusSchema = z.object({
  status: z.nativeEnum(MessageThreadStatus)
});

const threadInclude = {
  patient: {
    include: {
      user: true,
      center: true
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

type ThreadRecord = Prisma.MessageThreadGetPayload<{ include: typeof threadInclude }>;
type PatientIdentitySource = ThreadRecord["patient"];
type PatientIdentity = {
  nationalId: string | null;
  unifiedId: string | null;
};

function compact(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeText(value?: string | null) {
  return compact(value).toLocaleLowerCase();
}

function normalizeDigits(value?: string | null) {
  return compact(value).replace(/\D/g, "");
}

function identityKey(...parts: string[]) {
  return parts.join("::");
}

function nationalIdFromEmail(email?: string | null) {
  const localPart = email?.split("@")[0]?.trim();
  return localPart && /^\d{6,}$/.test(localPart) ? localPart : null;
}

async function resolvePatientIdentities(patients: PatientIdentitySource[]) {
  const identities = new Map<string, PatientIdentity>();
  const uniquePatients = [...new Map(patients.map((patient) => [patient.id, patient])).values()];
  const centerCodes = [...new Set(uniquePatients.map((patient) => patient.center.code).filter(Boolean))];
  const phones = [...new Set(uniquePatients.map((patient) => compact(patient.user.phone)).filter(Boolean))];
  const names = [...new Set(uniquePatients.map((patient) => compact(patient.user.fullName)).filter(Boolean))];

  const localByCenterPhone = new Map<string, PatientIdentity>();
  const localByCenterName = new Map<string, PatientIdentity>();
  const unifiedByPhone = new Map<string, PatientIdentity>();
  const unifiedByName = new Map<string, PatientIdentity>();

  if (centerCodes.length > 0 && (phones.length > 0 || names.length > 0)) {
    const localPatients = await prisma.localPatient.findMany({
      where: {
        center: {
          centerCode: {
            in: centerCodes
          }
        },
        OR: [
          ...(phones.length > 0 ? [{ phone: { in: phones } }] : []),
          ...(names.length > 0 ? [{ fullName: { in: names } }] : [])
        ]
      },
      include: {
        center: true,
        unifiedPatient: {
          select: {
            nationalId: true,
            unifiedId: true
          }
        }
      }
    });

    for (const patient of localPatients) {
      const identity = {
        nationalId: patient.unifiedPatient?.nationalId ?? null,
        unifiedId: patient.unifiedPatient?.unifiedId ?? patient.unifiedId ?? null
      };
      const phone = normalizeDigits(patient.phone);
      const name = normalizeText(patient.fullName);

      if (phone) {
        localByCenterPhone.set(identityKey(patient.center.centerCode, phone), identity);
      }

      if (name) {
        localByCenterName.set(identityKey(patient.center.centerCode, name), identity);
      }
    }

    const unifiedPatients = await prisma.unifiedPatient.findMany({
      where: {
        OR: [
          ...(phones.length > 0 ? [{ primaryPhone: { in: phones } }] : []),
          ...(names.length > 0 ? [{ fullName: { in: names } }] : [])
        ]
      },
      select: {
        nationalId: true,
        unifiedId: true,
        fullName: true,
        primaryPhone: true
      }
    });

    for (const patient of unifiedPatients) {
      const identity = {
        nationalId: patient.nationalId ?? null,
        unifiedId: patient.unifiedId
      };
      const phone = normalizeDigits(patient.primaryPhone);
      const name = normalizeText(patient.fullName);

      if (phone) {
        unifiedByPhone.set(phone, identity);
      }

      if (name) {
        unifiedByName.set(name, identity);
      }
    }
  }

  for (const patient of uniquePatients) {
    const centerCode = patient.center.code;
    const phone = normalizeDigits(patient.user.phone);
    const name = normalizeText(patient.user.fullName);
    const emailNationalId = nationalIdFromEmail(patient.user.email);
    const identity =
      (phone ? localByCenterPhone.get(identityKey(centerCode, phone)) : undefined) ??
      (name ? localByCenterName.get(identityKey(centerCode, name)) : undefined) ??
      (phone ? unifiedByPhone.get(phone) : undefined) ??
      (name ? unifiedByName.get(name) : undefined);

    identities.set(patient.id, {
      nationalId: identity?.nationalId ?? emailNationalId,
      unifiedId: identity?.unifiedId ?? null
    });
  }

  return identities;
}

async function mapThreadsWithIdentity(threads: ThreadRecord[]) {
  const identities = await resolvePatientIdentities(threads.map((thread) => thread.patient));
  return threads.map((thread) => mapThread(thread, identities.get(thread.patient.id)));
}

async function mapThreadWithIdentity(thread: ThreadRecord | null) {
  if (!thread) {
    return null;
  }

  return (await mapThreadsWithIdentity([thread]))[0];
}

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

    res.json(await mapThreadsWithIdentity(threads));
  })
);

router.get(
  "/patient-options",
  authenticate,
  authorize(UserRole.DOCTOR),
  asyncHandler(async (req, res) => {
    const actor = await resolvePortalActor(req.auth!);
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: actor.doctorProfileId },
      select: {
        centerId: true
      }
    });

    if (!doctor) {
      throw new AppError("Doctor profile was not found.", 404);
    }

    const patients = await prisma.patientProfile.findMany({
      where: {
        centerId: doctor.centerId
      },
      include: {
        user: true,
        center: true,
        messageThreads: {
          where: {
            doctorId: actor.doctorProfileId
          },
          select: {
            id: true
          },
          take: 1
        }
      }
    });
    const identities = await resolvePatientIdentities(patients);
    const options = patients
      .map((patient) => {
        const identity = identities.get(patient.id);

        return {
          id: patient.id,
          fullName: patient.user.fullName,
          phone: patient.user.phone,
          medicalRecordNumber: patient.medicalRecordNumber,
          nationalId: identity?.nationalId ?? null,
          unifiedId: identity?.unifiedId ?? null,
          threadId: patient.messageThreads[0]?.id ?? null
        };
      })
      .sort((left, right) => left.fullName.localeCompare(right.fullName, "ar"));

    res.json(options);
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
      update: {
        status: MessageThreadStatus.OPEN,
        closedAt: null,
        closedById: null
      },
      create: {
        patientId,
        doctorId,
        status: MessageThreadStatus.OPEN
      }
    });

    const initialMessage = payload.initialMessage?.trim();

    if (initialMessage) {
      await prisma.message.create({
        data: {
          threadId: thread.id,
          senderId: actor.userId,
          content: initialMessage
        }
      });
    }

    await touchThread(thread.id);

    const updatedThread = await prisma.messageThread.findUnique({
      where: { id: thread.id },
      include: threadInclude
    });

    if (updatedThread && initialMessage) {
      const recipientUserId =
        actor.role === UserRole.PATIENT ? updatedThread.doctor.userId : updatedThread.patient.userId;
      await createMessageNotification(recipientUserId);
    }

    res.status(201).json(await mapThreadWithIdentity(updatedThread));
  })
);

router.post(
  "/threads/:threadId/messages",
  authenticate,
  authorize(UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const { content, attachment } = sendMessageSchema.parse(req.body);
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

    if (thread.status === MessageThreadStatus.CLOSED) {
      throw new AppError("This conversation is closed. Reopen it before sending a new message.", 409);
    }

    await prisma.message.create({
      data: {
        threadId: thread.id,
        senderId: actor.userId,
        content: content || (attachment ? `مرفق: ${attachment.fileName}` : ""),
        attachmentFileName: attachment?.fileName,
        attachmentMimeType: attachment?.mimeType,
        attachmentBase64: attachment?.contentBase64,
        attachmentSizeBytes: attachment?.sizeBytes
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

    res.json(await mapThreadWithIdentity(updatedThread));
  })
);

router.patch(
  "/threads/:threadId/status",
  authenticate,
  authorize(UserRole.DOCTOR, UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const threadId = getSingleParam(req.params.threadId, "Thread ID");
    const { status } = threadStatusSchema.parse(req.body);
    const actor = await resolvePortalActor(req.auth!);
    await assertPatientMessagingSubscription(actor);

    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId }
    });

    if (!thread) {
      throw new AppError("Thread not found.", 404);
    }

    assertThreadAccess(thread, actor);

    const updatedThread = await prisma.messageThread.update({
      where: { id: thread.id },
      data:
        status === MessageThreadStatus.CLOSED
          ? {
              status,
              closedAt: new Date(),
              closedById: actor.userId,
              updatedAt: new Date()
            }
          : {
              status,
              closedAt: null,
              closedById: null,
              updatedAt: new Date()
            },
      include: threadInclude
    });

    res.json(await mapThreadWithIdentity(updatedThread));
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

    res.json(await mapThreadWithIdentity(updatedThread));
  })
);

export const communicationsRouter = router;

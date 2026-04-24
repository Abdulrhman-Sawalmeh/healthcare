import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma";
import { authorize, authorizeWorkspace, authenticate } from "../middleware/auth";
import {
  enqueueCentralNotification,
  processAllQueues,
  processCentralNotifications,
  syncCenterVisitsNow
} from "../services/notification-processor";
import {
  getCentralDashboardData,
  getCentersOverview,
  getCentralReferralsOverview,
  getMasterDataLists,
  getReportsSummary,
  getUnifiedPatients
} from "../services/network-queries";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

router.use(authenticate, authorizeWorkspace("central"), authorize("CENTRAL_ADMIN"));

const centerConnectionSchema = z.object({
  isConnected: z.boolean(),
  reason: z.string().max(255).optional()
});

const medicineSchema = z.object({
  genericName: z.string().min(2),
  brandName: z.string().min(2),
  category: z.string().min(2),
  unit: z.string().min(1),
  isCritical: z.boolean().default(false)
});

const labTestSchema = z.object({
  testName: z.string().min(2),
  category: z.string().min(2),
  normalRange: z.string().optional()
});

const specialtySchema = z.object({
  specialtyName: z.string().min(2),
  description: z.string().optional()
});

async function broadcastMasterDataSync(entity: string) {
  const centers = await prisma.centralCenter.findMany({
    where: {
      isConnected: true
    },
    select: {
      id: true
    }
  });

  await Promise.all(
    centers.map((center) =>
      enqueueCentralNotification(center.id, "SYNC_MASTER_DATA", {
        entity,
        synced_at: new Date().toISOString()
      })
    )
  );
}

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    res.json(await getCentralDashboardData());
  })
);

router.get(
  "/centers",
  asyncHandler(async (_req, res) => {
    res.json(await getCentersOverview());
  })
);

router.patch(
  "/centers/:centerId/connection",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    const payload = centerConnectionSchema.parse(req.body);

    const center = await prisma.centralCenter.update({
      where: { id: centerId },
      data: {
        isConnected: payload.isConnected,
        connectionSuspendedAt: payload.isConnected ? null : new Date(),
        suspensionReason: payload.isConnected ? null : payload.reason ?? "تم التعليق من قبل الإدارة المركزية."
      }
    });

    res.json(center);
  })
);

router.get(
  "/patients",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    res.json(await getUnifiedPatients(search));
  })
);

router.get(
  "/referrals",
  asyncHandler(async (_req, res) => {
    res.json(await getCentralReferralsOverview());
  })
);

router.get(
  "/master-data",
  asyncHandler(async (_req, res) => {
    res.json(await getMasterDataLists());
  })
);

router.post(
  "/master-data/medicines",
  asyncHandler(async (req, res) => {
    const payload = medicineSchema.parse(req.body);
    const medicine = await prisma.masterMedicine.create({
      data: payload
    });

    await broadcastMasterDataSync("medicines");
    res.status(201).json(medicine);
  })
);

router.put(
  "/master-data/medicines/:id",
  asyncHandler(async (req, res) => {
    const payload = medicineSchema.parse(req.body);
    const medicine = await prisma.masterMedicine.update({
      where: { id: Number(req.params.id) },
      data: {
        ...payload,
        version: {
          increment: 1
        }
      }
    });

    await broadcastMasterDataSync("medicines");
    res.json(medicine);
  })
);

router.post(
  "/master-data/lab-tests",
  asyncHandler(async (req, res) => {
    const payload = labTestSchema.parse(req.body);
    const labTest = await prisma.masterLabTest.create({
      data: payload
    });

    await broadcastMasterDataSync("lab-tests");
    res.status(201).json(labTest);
  })
);

router.put(
  "/master-data/lab-tests/:id",
  asyncHandler(async (req, res) => {
    const payload = labTestSchema.parse(req.body);
    const labTest = await prisma.masterLabTest.update({
      where: { id: Number(req.params.id) },
      data: {
        ...payload,
        version: {
          increment: 1
        }
      }
    });

    await broadcastMasterDataSync("lab-tests");
    res.json(labTest);
  })
);

router.post(
  "/master-data/specialties",
  asyncHandler(async (req, res) => {
    const payload = specialtySchema.parse(req.body);
    const specialty = await prisma.masterSpecialty.create({
      data: payload
    });

    await broadcastMasterDataSync("specialties");
    res.status(201).json(specialty);
  })
);

router.put(
  "/master-data/specialties/:id",
  asyncHandler(async (req, res) => {
    const payload = specialtySchema.parse(req.body);
    const specialty = await prisma.masterSpecialty.update({
      where: { id: Number(req.params.id) },
      data: payload
    });

    await broadcastMasterDataSync("specialties");
    res.json(specialty);
  })
);

router.get(
  "/reports",
  asyncHandler(async (_req, res) => {
    res.json(await getReportsSummary());
  })
);

router.get(
  "/notifications",
  asyncHandler(async (_req, res) => {
    const [outgoing, incoming, communicationLogs] = await Promise.all([
      prisma.centralNotification.findMany({
        include: {
          targetCenter: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 30
      }),
      prisma.centerNotification.findMany({
        include: {
          fromCenter: true
        },
        orderBy: {
          receivedAt: "desc"
        },
        take: 30
      }),
      prisma.communicationLog.findMany({
        include: {
          center: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 30
      })
    ]);

    res.json({
      outgoing,
      incoming,
      communicationLogs
    });
  })
);

router.post(
  "/process",
  asyncHandler(async (_req, res) => {
    res.json(await processCentralNotifications());
  })
);

router.post(
  "/sync-centers/:centerId",
  asyncHandler(async (req, res) => {
    const centerId = Number(req.params.centerId);
    res.json(await syncCenterVisitsNow(centerId));
  })
);

router.post(
  "/dispatch-pending",
  asyncHandler(async (_req, res) => {
    res.json(await processCentralNotifications());
  })
);

export const centralRouter = router;

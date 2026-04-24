import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { asyncHandler } from "../utils/async-handler";
import { getSingleParam } from "../utils/request";
import { mapNotification } from "../utils/serializers";

const router = Router();

router.get(
  "/",
  authenticate,
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.auth!.sub
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json(notifications.map(mapNotification));
  })
);

router.patch(
  "/:notificationId/read",
  authenticate,
  asyncHandler(async (req, res) => {
    const notificationId = getSingleParam(req.params.notificationId, "Notification ID");
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification || notification.userId !== req.auth!.sub) {
      throw new AppError("Notification not found.", 404);
    }

    const updated = await prisma.notification.update({
      where: {
        id: notification.id
      },
      data: {
        isRead: true
      }
    });

    res.json(mapNotification(updated));
  })
);

export const notificationsRouter = router;

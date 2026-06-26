import { AlertSeverity, CenterUserRole } from "@prisma/client";

import { prisma } from "../lib/prisma";

interface InternalNotificationInput {
  centerId: number;
  type: string;
  title: string;
  message: string;
  severity?: AlertSeverity;
}

interface RoleNotificationInput extends InternalNotificationInput {
  role: CenterUserRole;
}

interface UserNotificationInput extends RoleNotificationInput {
  userId: number;
}

export async function createInternalNotification(input: InternalNotificationInput) {
  try {
    return await prisma.centerSystemAlert.create({
      data: {
        centerId: input.centerId,
        alertType: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity ?? "INFO"
      }
    });
  } catch (error) {
    console.error("Failed to create internal notification", error);
    return null;
  }
}

export function notifyRole(input: RoleNotificationInput) {
  return createInternalNotification({
    ...input,
    type: `ROLE_${input.role}_${input.type}`
  });
}

export function notifyCenterUser(input: UserNotificationInput) {
  return createInternalNotification({
    ...input,
    type: `USER_${input.role}_${input.userId}_${input.type}`
  });
}

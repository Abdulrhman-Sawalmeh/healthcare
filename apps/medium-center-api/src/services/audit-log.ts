import { Prisma } from "@prisma/client";
import { Request } from "express";

import { prisma } from "../lib/prisma";

type AuditValue = Prisma.InputJsonValue | undefined;

interface AuditLogInput {
  action: string;
  entityType: string;
  entityId?: string | number | null;
  centerId?: string | number | null;
  actorUserId?: string | number | null;
  actorUsername?: string | null;
  actorRole?: string | null;
  workspace?: string | null;
  oldValue?: AuditValue;
  newValue?: AuditValue;
}

function forwardedIp(req: Request) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (Array.isArray(forwardedFor)) {
    return forwardedFor[0];
  }

  return forwardedFor?.split(",")[0]?.trim() || req.ip;
}

export async function recordAuditLog(req: Request, input: AuditLogInput) {
  const centerId = input.centerId ?? req.auth?.centerId;

  try {
    await prisma.auditLog.create({
      data: {
        centerId: centerId == null ? undefined : Number(centerId),
        actorUserId: input.actorUserId == null ? req.auth?.sub : String(input.actorUserId),
        actorUsername: input.actorUsername ?? req.auth?.username,
        actorRole: input.actorRole ?? req.auth?.role,
        workspace: input.workspace ?? req.auth?.workspace,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId == null ? undefined : String(input.entityId),
        oldValue: input.oldValue,
        newValue: input.newValue,
        ipAddress: forwardedIp(req)
      }
    });
  } catch (error) {
    console.error("Failed to write audit log", error);
  }
}

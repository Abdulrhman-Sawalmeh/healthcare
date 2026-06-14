import { Router } from "express";
import { z } from "zod";

import { signAuthToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { recordAuditLog } from "../services/audit-log";
import { loginWorkspaceUser, resolveSessionUser } from "../services/workspace-auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();
const CENTRAL_ADMIN_ALIAS = "central-admin";
const DEMO_PASSWORD = "Password123!";

const loginSchema = z.object({
  identifier: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(8)
});

async function resolveDemoIdentifier(identifier: string) {
  if (identifier !== CENTRAL_ADMIN_ALIAS) {
    return identifier;
  }

  const user = await prisma.centralUser.findFirst({
    where: { isActive: true },
    orderBy: { id: "asc" },
    select: { username: true }
  });

  return user?.username ?? identifier;
}

router.get(
  "/demo-accounts",
  asyncHandler(async (_req, res) => {
    const user = await prisma.centralUser.findFirst({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: {
        fullName: true
      }
    });

    res.json(
      user
        ? [
            {
              group: "central",
              roleLabel: "CENTRAL_ADMIN",
              identifier: CENTRAL_ADMIN_ALIAS,
              password: DEMO_PASSWORD,
              fullName: user.fullName
            }
          ]
        : []
    );
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const identifier = payload.identifier ?? payload.email;

    if (!identifier) {
      return res.status(400).json({ message: "Username or email is required." });
    }

    const loginIdentifier = await resolveDemoIdentifier(identifier);
    const result = await loginWorkspaceUser(loginIdentifier, payload.password);
    await recordAuditLog(req, {
      action: "LOGIN",
      entityType: "Session",
      entityId: result.user.id,
      centerId: result.user.center?.id,
      actorUserId: result.user.id,
      actorUsername: result.user.username,
      actorRole: result.user.role,
      workspace: result.workspace,
      newValue: {
        identifier: loginIdentifier,
        role: result.user.role,
        workspace: result.workspace
      }
    });

    const token = signAuthToken({
      sub: result.user.id,
      role: result.user.role,
      workspace: result.workspace,
      centerId: result.user.center ? String(result.user.center.id) : undefined,
      username: result.user.username
    });

    res.json({
      token,
      user: result.user
    });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await resolveSessionUser(req.auth!.workspace, req.auth!.sub);

    res.json({
      user
    });
  })
);

export const authRouter = router;

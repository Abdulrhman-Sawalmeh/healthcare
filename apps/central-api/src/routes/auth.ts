import { Router } from "express";
import { z } from "zod";

import { signAuthToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { recordAuditLog } from "../services/audit-log";
import { confirmPasswordReset, requestPasswordReset, verifyPasswordResetCode } from "../services/password-reset";
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

const passwordResetRequestSchema = z.object({
  email: z.string().email()
});

const passwordResetVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().trim().min(4).max(10)
});

const passwordResetConfirmSchema = z.object({
  email: z.string().email(),
  resetToken: z.string().min(32),
  newPassword: z.string().min(8)
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

router.post(
  "/password-reset/request",
  asyncHandler(async (req, res) => {
    const payload = passwordResetRequestSchema.parse(req.body);

    const result = await requestPasswordReset(payload.email);

    res.json({
      success: true,
      deliveryMethod: result.deliveryMethod,
      message:
        result.deliveryMethod === "OUTBOX"
          ? "تم إنشاء رمز التحقق، لكن تعذر إرسال البريد من المزود الحالي وتم حفظ الرسالة في سجل البريد المحلي."
          : "إذا كان البريد مرتبطا بحساب فعال، تم إرسال كود التحقق إليه."
    });
  })
);

router.post(
  "/password-reset/verify",
  asyncHandler(async (req, res) => {
    const payload = passwordResetVerifySchema.parse(req.body);
    const result = await verifyPasswordResetCode(payload);

    res.json({
      success: true,
      resetToken: result.resetToken,
      resetTokenExpiresAt: result.resetTokenExpiresAt
    });
  })
);

router.post(
  "/password-reset/confirm",
  asyncHandler(async (req, res) => {
    const payload = passwordResetConfirmSchema.parse(req.body);

    await confirmPasswordReset(payload);

    res.json({
      success: true
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

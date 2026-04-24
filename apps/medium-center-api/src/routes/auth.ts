import { Router } from "express";
import { z } from "zod";

import { signAuthToken } from "../lib/jwt";
import { authenticate } from "../middleware/auth";
import { loginWorkspaceUser, resolveSessionUser } from "../services/workspace-auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(8)
});

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const identifier = payload.identifier ?? payload.email;

    if (!identifier) {
      return res.status(400).json({ message: "اسم المستخدم أو البريد الإلكتروني مطلوب." });
    }

    const result = await loginWorkspaceUser(identifier, payload.password);

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

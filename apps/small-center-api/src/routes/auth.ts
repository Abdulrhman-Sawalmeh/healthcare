import { CenterUserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { systemConfig } from "../config/system";
import { signAuthToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";
import { recordAuditLog } from "../services/audit-log";
import { loginWorkspaceUser, resolveSessionUser } from "../services/workspace-auth";
import { asyncHandler } from "../utils/async-handler";

const router = Router();
const demoPrefix = "small";
const demoPassword = "Password123!";
const demoRoleAliases: Partial<Record<CenterUserRole, string>> = {
  CENTER_MANAGER: `${demoPrefix}-manager`,
  DOCTOR: `${demoPrefix}-doctor`,
  RECEPTIONIST: `${demoPrefix}-receptionist`
};
const demoPatientAlias = `${demoPrefix}-patient`;

const loginSchema = z.object({
  identifier: z.string().min(3).optional(),
  email: z.string().min(3).optional(),
  password: z.string().min(8)
});

async function findCenterUserByRole(role: CenterUserRole) {
  return prisma.centerUserAccount.findFirst({
    where: {
      isActive: true,
      role,
      ...(systemConfig.allowedCenterCode
        ? {
            center: {
              centerCode: systemConfig.allowedCenterCode
            }
          }
        : {})
    },
    include: { center: true },
    orderBy: { id: "asc" }
  });
}

async function findDemoPatient() {
  const where = {
    isActive: true,
    role: "PATIENT" as const,
    patientProfile: systemConfig.allowedCenterCode
      ? {
          center: {
            code: systemConfig.allowedCenterCode
          }
        }
      : undefined
  };
  const include = {
    patientProfile: {
      include: { center: true }
    }
  };

  return (
    (await prisma.user.findFirst({
      where: {
        ...where,
        passwordHash: demoPassword
      },
      include,
      orderBy: { fullName: "asc" }
    })) ??
    prisma.user.findFirst({
      where,
      include,
      orderBy: { fullName: "asc" }
    })
  );
}

async function resolveDemoIdentifier(identifier: string) {
  const roleEntry = Object.entries(demoRoleAliases).find(([, alias]) => alias === identifier);

  if (roleEntry) {
    const user = await findCenterUserByRole(roleEntry[0] as CenterUserRole);
    return user?.username ?? identifier;
  }

  if (identifier === demoPatientAlias) {
    const user = await findDemoPatient();
    return user?.email.includes("@") ? user.email.split("@")[0] : user?.email ?? identifier;
  }

  return identifier;
}

router.get(
  "/demo-accounts",
  asyncHandler(async (_req, res) => {
    const centerUsers = await Promise.all(
      (Object.keys(demoRoleAliases) as CenterUserRole[]).map(async (role) => ({
        role,
        alias: demoRoleAliases[role]!,
        user: await findCenterUserByRole(role)
      }))
    );
    const patient = await findDemoPatient();

    res.json([
      ...centerUsers
        .filter((entry) => entry.user)
        .map((entry) => ({
          group: entry.user!.center.centerName,
          roleLabel: entry.role,
          identifier: entry.alias,
          password: demoPassword,
          fullName: entry.user!.fullName
        })),
      ...(patient
        ? [
            {
              group: patient.patientProfile?.center.name ?? "patient-portal",
              roleLabel: "PATIENT",
              identifier: demoPatientAlias,
              password: demoPassword,
              fullName: patient.fullName
            }
          ]
        : [])
    ]);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    const identifier = payload.identifier ?? payload.email;

    if (!identifier) {
      return res.status(400).json({ message: "Username, ID number, or email is required." });
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
      doctorProfileId: result.user.doctorProfileId,
      patientProfileId: result.user.patientProfileId,
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

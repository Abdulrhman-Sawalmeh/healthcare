import bcrypt from "bcryptjs";

import { systemConfig, isWorkspaceAllowed } from "../config/system";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { AuthWorkspace, hasCenterModules, SessionUser } from "../types/auth";

function mapCentralSession(user: {
  id: number;
  username: string;
  email: string;
  fullName: string;
}): SessionUser {
  return {
    id: String(user.id),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: "CENTRAL_ADMIN",
    workspace: "central"
  };
}

function mapCenterSession(user: {
  id: number;
  username: string;
  email: string | null;
  fullName: string;
  role: SessionUser["role"];
  center: {
    id: number;
    centerCode: string;
    centerName: string;
    centerType: "CLINIC" | "MEDICAL_CENTER" | "HOSPITAL";
    city: string;
    region: string;
    isConnected: boolean;
  };
}): SessionUser {
  const modules = hasCenterModules(user.center.centerType);

  return {
    id: String(user.id),
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    workspace: "center",
    center: {
      id: user.center.id,
      code: user.center.centerCode,
      name: user.center.centerName,
      type: user.center.centerType,
      city: user.center.city,
      region: user.center.region,
      isConnected: user.center.isConnected,
      ...modules
    }
  };
}

export async function resolveSessionUser(workspace: AuthWorkspace, subjectId: string) {
  if (workspace === "central") {
    if (!isWorkspaceAllowed("central")) {
      throw new AppError(systemConfig.accessDeniedMessage, 403);
    }

    const user = await prisma.centralUser.findUnique({
      where: { id: Number(subjectId) }
    });

    if (!user || !user.isActive) {
      throw new AppError("حساب الإدارة المركزية غير متاح.", 401);
    }

    return mapCentralSession(user);
  }

  if (workspace === "center") {
    const user = await prisma.centerUserAccount.findUnique({
      where: { id: Number(subjectId) },
      include: {
        center: true
      }
    });

    if (!user || !user.isActive) {
      throw new AppError("حساب المركز غير متاح.", 401);
    }

    if (!isWorkspaceAllowed("center", user.center.centerCode)) {
      throw new AppError(systemConfig.accessDeniedMessage, 403);
    }

    return mapCenterSession(user);
  }

  throw new AppError("الجلسات القديمة غير مدعومة في هذا النظام.", 401);
}

export async function loginWorkspaceUser(identifier: string, password: string) {
  if (systemConfig.workspace === "central") {
    const centralUser = await prisma.centralUser.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }]
      }
    });

    if (centralUser && centralUser.isActive && (await bcrypt.compare(password, centralUser.passwordHash))) {
      await prisma.centralUser.update({
        where: { id: centralUser.id },
        data: { lastLogin: new Date() }
      });

      return {
        workspace: "central" as const,
        user: mapCentralSession(centralUser)
      };
    }
  }

  if (systemConfig.workspace === "center") {
    const centerUser = await prisma.centerUserAccount.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
        ...(systemConfig.allowedCenterCode
          ? {
              center: {
                centerCode: systemConfig.allowedCenterCode
              }
            }
          : {})
      },
      include: {
        center: true
      }
    });

    if (centerUser && centerUser.isActive && (await bcrypt.compare(password, centerUser.passwordHash))) {
      await prisma.centerUserAccount.update({
        where: { id: centerUser.id },
        data: { lastLogin: new Date() }
      });

      return {
        workspace: "center" as const,
        user: mapCenterSession(centerUser)
      };
    }
  }

  throw new AppError("بيانات الدخول غير صحيحة أو لا تنتمي لهذا النظام.", 401);
}

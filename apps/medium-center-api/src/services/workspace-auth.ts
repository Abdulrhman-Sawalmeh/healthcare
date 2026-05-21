import { CenterUserRole, CentralCenterType, Prisma, UserRole } from "@prisma/client";

import { isWorkspaceAllowed, systemConfig } from "../config/system";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { AuthWorkspace, hasCenterModules, SessionUser } from "../types/auth";

const hiddenCenterRoles = new Set<CenterUserRole>(["LAB_TECH", "PHARMACIST", "NURSE"]);

type PromptCenterUser = {
  id: number;
  username: string;
  email: string | null;
  fullName: string;
  role: SessionUser["role"];
  center: {
    id: number;
    centerCode: string;
    centerName: string;
    centerType: CentralCenterType;
    city: string;
    region: string;
    isConnected: boolean;
  };
};

type LegacyPortalUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  patientProfile: {
    id: string;
    center: {
      id: string;
      code: string;
      name: string;
      city: string;
    };
  } | null;
  doctorProfile: {
    id: string;
    center: {
      id: string;
      code: string;
      name: string;
      city: string;
    };
    department: {
      name: string;
    };
  } | null;
  adminMemberships: Array<{
    center: {
      id: string;
      code: string;
      name: string;
      city: string;
    };
  }>;
};

function inferLegacyCenterType(centerCode: string): CentralCenterType {
  if (centerCode.startsWith("C")) {
    return "CLINIC";
  }

  if (centerCode.startsWith("M")) {
    return "MEDICAL_CENTER";
  }

  return "HOSPITAL";
}

function toLegacyUsername(email: string) {
  return email.includes("@") ? email.split("@")[0] : email;
}

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

function mapCenterSession(user: PromptCenterUser): SessionUser {
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

function mapLegacySession(user: LegacyPortalUser): SessionUser {
  const center =
    user.patientProfile?.center ?? user.doctorProfile?.center ?? user.adminMemberships[0]?.center;
  const centerType = center ? inferLegacyCenterType(center.code) : "MEDICAL_CENTER";
  const modules = hasCenterModules(centerType);

  return {
    id: user.id,
    username: toLegacyUsername(user.email),
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    workspace: "legacy",
    patientProfileId: user.patientProfile?.id,
    doctorProfileId: user.doctorProfile?.id,
    departmentName: user.doctorProfile?.department.name,
    memberships: user.adminMemberships.map((membership) => ({
      centerId: membership.center.id,
      centerName: membership.center.name
    })),
    center: center
      ? {
          id: center.id,
          code: center.code,
          name: center.name,
          type: centerType,
          city: center.city,
          region: center.city,
          isConnected: true,
          ...modules
        }
      : undefined
  };
}

function passwordMatches(password: string, storedPassword: string) {
  return password === storedPassword;
}

async function loadLegacyUser(where: Prisma.UserWhereInput) {
  return prisma.user.findFirst({
    where: {
      isActive: true,
      role: UserRole.PATIENT,
      ...where
    },
    include: {
      patientProfile: {
        include: {
          center: true
        }
      },
      doctorProfile: {
        include: {
          center: true,
          department: true
        }
      },
      adminMemberships: {
        include: {
          center: true
        }
      }
    }
  });
}

async function findLegacyUserByNationalId(identifier: string) {
  const unifiedPatient = await prisma.unifiedPatient.findFirst({
    where: {
      nationalId: identifier
    },
    include: {
      localPatients: {
        select: {
          center: {
            select: {
              centerCode: true
            }
          }
        }
      }
    }
  });

  if (!unifiedPatient) {
    return null;
  }

  const centerCodes = [...new Set(unifiedPatient.localPatients.map((patient) => patient.center.centerCode))];

  const legacyCenters = centerCodes.length
    ? await prisma.center.findMany({
        where: {
          code: {
            in: centerCodes
          }
        },
        select: {
          id: true
        }
      })
    : [];

  return loadLegacyUser({
    phone: unifiedPatient.primaryPhone,
    fullName: unifiedPatient.fullName,
    ...(legacyCenters.length > 0
      ? {
          patientProfile: {
            is: {
              centerId: {
                in: legacyCenters.map((center) => center.id)
              }
            }
          }
        }
      : {})
  });
}

async function findLegacyUser(identifier: string) {
  const directMatch = await loadLegacyUser({
    OR: [{ email: identifier }, { email: { startsWith: `${identifier}@` } }, { phone: identifier }]
  });

  if (directMatch) {
    return directMatch;
  }

  return findLegacyUserByNationalId(identifier);
}

async function findLegacyUserById(subjectId: string) {
  return prisma.user.findUnique({
    where: { id: subjectId },
    include: {
      patientProfile: {
        include: {
          center: true
        }
      },
      doctorProfile: {
        include: {
          center: true,
          department: true
        }
      },
      adminMemberships: {
        include: {
          center: true
        }
      }
    }
  });
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
      throw new AppError("Ø­Ø³Ø§Ø¨ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ù…Ø±ÙƒØ²ÙŠØ© ØºÙŠØ± Ù…ØªØ§Ø­.", 401);
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

    if (!user || !user.isActive || hiddenCenterRoles.has(user.role)) {
      throw new AppError("Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…Ø±ÙƒØ² ØºÙŠØ± Ù…ØªØ§Ø­.", 401);
    }

    if (!isWorkspaceAllowed("center", user.center.centerCode)) {
      throw new AppError(systemConfig.accessDeniedMessage, 403);
    }

    return mapCenterSession(user);
  }

  if (workspace === "legacy") {
    const user = await findLegacyUserById(subjectId);

    if (!user || !user.isActive || user.role !== UserRole.PATIENT || !user.patientProfile) {
      throw new AppError("Ø­Ø³Ø§Ø¨ Ø¨ÙˆØ§Ø¨Ø© Ø§Ù„Ù…Ø±ÙŠØ¶ ØºÙŠØ± Ù…ØªØ§Ø­.", 401);
    }

    if (!isWorkspaceAllowed("legacy", user.patientProfile.center.code)) {
      throw new AppError(systemConfig.accessDeniedMessage, 403);
    }

    return mapLegacySession(user);
  }

  throw new AppError("Ø§Ù„Ø¬Ù„Ø³Ø§Øª Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© ØºÙŠØ± Ù…Ø¯Ø¹ÙˆÙ…Ø© ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù†Ø¸Ø§Ù….", 401);
}

export async function loginWorkspaceUser(identifier: string, password: string) {
  if (systemConfig.workspace === "central") {
    const centralUser = await prisma.centralUser.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }]
      }
    });

    if (centralUser && centralUser.isActive && (await passwordMatches(password, centralUser.passwordHash))) {
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

    if (
      centerUser &&
      centerUser.isActive &&
      !hiddenCenterRoles.has(centerUser.role) &&
      (await passwordMatches(password, centerUser.passwordHash))
    ) {
      await prisma.centerUserAccount.update({
        where: { id: centerUser.id },
        data: { lastLogin: new Date() }
      });

      return {
        workspace: "center" as const,
        user: mapCenterSession(centerUser)
      };
    }

    const legacyUser = await findLegacyUser(identifier);

    if (
      legacyUser &&
      legacyUser.patientProfile &&
      isWorkspaceAllowed("legacy", legacyUser.patientProfile.center.code) &&
      (await passwordMatches(password, legacyUser.passwordHash))
    ) {
      return {
        workspace: "legacy" as const,
        user: mapLegacySession(legacyUser)
      };
    }
  }

  throw new AppError("Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯Ø®ÙˆÙ„ ØºÙŠØ± ØµØ­ÙŠØ­Ø© Ø£Ùˆ Ù„Ø§ ØªÙ†ØªÙ…ÙŠ Ù„Ù‡Ø°Ø§ Ø§Ù„Ù†Ø¸Ø§Ù….", 401);
}

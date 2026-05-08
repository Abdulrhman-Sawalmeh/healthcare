import { Prisma, UserRole } from "@prisma/client";

import { AuthTokenPayload } from "../lib/jwt";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { requireProfileId } from "../utils/scope";

export type PortalActor = {
  userId: string;
  role: "DOCTOR" | "PATIENT";
  doctorProfileId?: string;
  patientProfileId?: string;
};

function getLegacyDoctorMatchers(centerUser: {
  fullName: string;
  username: string;
  email: string | null;
  phone: string | null;
}): Prisma.UserWhereInput[] {
  const matchers: Prisma.UserWhereInput[] = [
    { fullName: centerUser.fullName },
    { email: { startsWith: `${centerUser.username}@` } },
    { email: { startsWith: `${centerUser.username}.portal@` } }
  ];

  if (centerUser.email) {
    matchers.push({ email: centerUser.email });
  }

  if (centerUser.phone) {
    matchers.push({ phone: centerUser.phone });
  }

  return matchers;
}

async function resolveCenterDoctorActor(auth: AuthTokenPayload): Promise<PortalActor> {
  const centerUserId = Number(auth.sub);

  if (!Number.isInteger(centerUserId)) {
    throw new AppError("Doctor account is invalid for the medical messaging portal.", 400);
  }

  const centerUser = await prisma.centerUserAccount.findUnique({
    where: { id: centerUserId },
    include: {
      center: true
    }
  });

  if (!centerUser || centerUser.role !== "DOCTOR") {
    throw new AppError("Doctor account is not available for the medical messaging portal.", 403);
  }

  const candidates = await prisma.doctorProfile.findMany({
    where: {
      center: {
        code: centerUser.center.centerCode
      },
      user: {
        role: UserRole.DOCTOR,
        OR: getLegacyDoctorMatchers(centerUser)
      }
    },
    include: {
      user: true
    }
  });

  const exactNameMatches = candidates.filter(
    (candidate) => candidate.user.fullName === centerUser.fullName
  );

  if (exactNameMatches.length === 1) {
    return {
      userId: exactNameMatches[0].userId,
      role: UserRole.DOCTOR,
      doctorProfileId: exactNameMatches[0].id
    };
  }

  if (centerUser.email) {
    const exactEmailMatches = candidates.filter(
      (candidate) => candidate.user.email === centerUser.email
    );

    if (exactEmailMatches.length === 1) {
      return {
        userId: exactEmailMatches[0].userId,
        role: UserRole.DOCTOR,
        doctorProfileId: exactEmailMatches[0].id
      };
    }
  }

  if (centerUser.phone) {
    const exactPhoneMatches = candidates.filter(
      (candidate) => candidate.user.phone === centerUser.phone
    );

    if (exactPhoneMatches.length === 1) {
      return {
        userId: exactPhoneMatches[0].userId,
        role: UserRole.DOCTOR,
        doctorProfileId: exactPhoneMatches[0].id
      };
    }
  }

  if (candidates.length === 1) {
    return {
      userId: candidates[0].userId,
      role: UserRole.DOCTOR,
      doctorProfileId: candidates[0].id
    };
  }

  if (candidates.length > 1) {
    throw new AppError(
      "Multiple medical profiles matched this doctor account. Please link the doctor account to a single portal profile.",
      409
    );
  }

  throw new AppError(
    "No portal doctor profile was found for this doctor account inside the patient messaging portal.",
    404
  );
}

export async function resolvePortalActor(auth: AuthTokenPayload): Promise<PortalActor> {
  if (auth.role === UserRole.PATIENT) {
    return {
      userId: auth.sub,
      role: UserRole.PATIENT,
      patientProfileId: requireProfileId(auth.patientProfileId, "Patient profile is required.")
    };
  }

  if (auth.role === UserRole.DOCTOR) {
    if (auth.workspace === "center") {
      return resolveCenterDoctorActor(auth);
    }

    return {
      userId: auth.sub,
      role: UserRole.DOCTOR,
      doctorProfileId: requireProfileId(auth.doctorProfileId, "Doctor profile is required.")
    };
  }

  throw new AppError("This account cannot access the secure medical messaging portal.", 403);
}

export async function resolvePortalNotificationUserId(auth: AuthTokenPayload) {
  if (auth.role === UserRole.DOCTOR) {
    return (await resolvePortalActor(auth)).userId;
  }

  return auth.sub;
}

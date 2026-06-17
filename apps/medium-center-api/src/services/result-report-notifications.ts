import { Prisma, UserRole } from "@prisma/client";

import { prisma } from "../lib/prisma";

type ResultReportNotificationInput = {
  centerId: number;
  patientId: number;
  reportTitle: string;
  reportUrl?: string | null;
  shareWithPatient: boolean;
};

type PatientNotificationInput = {
  centerId: number;
  patientId: number;
  title: string;
  body: string;
  type?: "APPOINTMENT" | "REFERRAL" | "MESSAGE" | "PAYMENT" | "SYSTEM";
};

function compact(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeIdentifier(value: string | null | undefined) {
  return compact(value)?.replace(/\s+/g, "") ?? null;
}

async function resolvePortalPatientUserId(centerId: number, patientId: number) {
  const localPatient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    include: {
      center: {
        select: {
          centerCode: true
        }
      },
      unifiedPatient: {
        select: {
          nationalId: true,
          primaryPhone: true
        }
      }
    }
  });

  if (!localPatient) {
    return null;
  }

  const portalCenter = await prisma.center.findUnique({
    where: {
      code: localPatient.center.centerCode
    },
    select: {
      id: true
    }
  });

  if (!portalCenter) {
    return null;
  }

  const nationalId = normalizeIdentifier(localPatient.unifiedPatient?.nationalId);
  const phones = [...new Set([compact(localPatient.phone), compact(localPatient.unifiedPatient?.primaryPhone)].filter(Boolean))];
  const matchers: Prisma.UserWhereInput[] = [];

  if (nationalId) {
    matchers.push({
      email: {
        startsWith: `${nationalId}@`
      }
    });
  }

  for (const phone of phones) {
    matchers.push({
      phone,
      patientProfile: {
        is: {
          centerId: portalCenter.id
        }
      }
    });
  }

  matchers.push({
    fullName: localPatient.fullName,
    patientProfile: {
      is: {
        centerId: portalCenter.id
      }
    }
  });

  const user = await prisma.user.findFirst({
    where: {
      role: UserRole.PATIENT,
      OR: matchers
    },
    select: {
      id: true
    }
  });

  return user?.id ?? null;
}

export async function notifyLocalPatient(input: PatientNotificationInput) {
  try {
    const userId = await resolvePortalPatientUserId(input.centerId, input.patientId);

    if (!userId) {
      return;
    }

    await prisma.notification.create({
      data: {
        userId,
        title: input.title,
        body: input.body,
        type: input.type ?? "SYSTEM"
      }
    });
  } catch (error) {
    console.error("Failed to create patient notification", error);
  }
}

export async function notifyPatientAboutResultReport(input: ResultReportNotificationInput) {
  if (!input.shareWithPatient || !input.reportUrl) {
    return;
  }

  try {
    const userId = await resolvePortalPatientUserId(input.centerId, input.patientId);

    if (!userId) {
      return;
    }

    await prisma.notification.create({
      data: {
        userId,
        title: "تم استلام تقرير جديد",
        body: `تم إرسال تقرير "${input.reportTitle}" إلى سجلك الصحي. اضغط على الإشعار لفتح صفحة التقارير والنتائج.`,
        type: "SYSTEM"
      }
    });
  } catch (error) {
    console.error("Failed to create patient result report notification", error);
  }
}

import { Gender, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export interface EnsurePatientPortalAccountInput {
  centerId: number;
  fullName: string;
  nationalId: string;
  primaryPhone: string;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact?: string;
  chronicDiseases: string[];
}

export interface EnsurePatientPortalAccountResult {
  loginIdentifier: string;
  deliveryMethod: "WEBHOOK" | "OUTBOX";
  accountStatus: "CREATED" | "RESET";
}

export interface SyncPatientPortalProfileInput {
  centerId: number;
  fullName: string;
  nationalId?: string;
  primaryPhone: string;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact?: string;
  chronicDiseases: string[];
}

function normalizeNationalId(value: string) {
  return value.replace(/\s+/g, "");
}

function buildPatientEmail(nationalId: string) {
  return `${normalizeNationalId(nationalId)}@patients.local`;
}

function buildMedicalRecordNumber(centerCode: string) {
  const suffix = `${Date.now()}`.slice(-6);
  return `MRN-${centerCode}-${new Date().getFullYear()}-${suffix}`;
}

function generateTemporaryPassword(length = 10) {
  return Array.from({ length }, () => passwordAlphabet[randomInt(passwordAlphabet.length)]).join("");
}

function formatChronicConditions(chronicDiseases: string[]) {
  return chronicDiseases.length > 0 ? chronicDiseases.join("، ") : null;
}

async function appendSmsToOutbox(payload: {
  phone: string;
  patientName: string;
  nationalId: string;
  centerName: string;
  message: string;
}) {
  const outboxDir = path.resolve(process.cwd(), "runtime-logs");
  const outboxFile = path.join(outboxDir, "sms-outbox.log");

  await mkdir(outboxDir, { recursive: true });
  await appendFile(
    outboxFile,
    `${JSON.stringify({
      createdAt: new Date().toISOString(),
      phone: payload.phone,
      patientName: payload.patientName,
      nationalId: payload.nationalId,
      centerName: payload.centerName,
      message: payload.message
    })}\n`,
    "utf8"
  );
}

async function sendPatientPasswordSms(input: {
  phone: string;
  patientName: string;
  centerName: string;
  nationalId: string;
  temporaryPassword: string;
}) {
  const webhookUrl = process.env.SMS_WEBHOOK_URL?.trim();
  const apiKey = process.env.SMS_API_KEY?.trim();
  const senderName = process.env.SMS_SENDER_NAME?.trim() || "Healthcare";
  const message = `مرحباً ${input.patientName}، تم إنشاء حسابك في ${input.centerName}. اسم الدخول: ${input.nationalId}. كلمة المرور المؤقتة: ${input.temporaryPassword}`;

  if (webhookUrl) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {})
        },
        body: JSON.stringify({
          to: input.phone,
          from: senderName,
          message
        })
      });

      if (response.ok) {
        return "WEBHOOK" as const;
      }
    } catch {
      // Fall back to the local outbox below so account creation still completes.
    }
  }

  await appendSmsToOutbox({
    phone: input.phone,
    patientName: input.patientName,
    nationalId: input.nationalId,
    centerName: input.centerName,
    message
  });
  return "OUTBOX" as const;
}

export async function ensurePatientPortalAccount(
  input: EnsurePatientPortalAccountInput
): Promise<EnsurePatientPortalAccountResult> {
  const loginIdentifier = normalizeNationalId(input.nationalId);
  const patientEmail = buildPatientEmail(loginIdentifier);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);

  const center = await prisma.centralCenter.findUnique({
    where: { id: input.centerId },
    select: {
      centerCode: true,
      centerName: true
    }
  });

  if (!center) {
    throw new AppError("تعذر تحديد المركز الصحي المرتبط بحساب المريض.", 404);
  }

  const legacyCenter = await prisma.center.findUnique({
    where: { code: center.centerCode },
    select: {
      id: true
    }
  });

  if (!legacyCenter) {
    throw new AppError("تعذر العثور على بوابة المرضى الخاصة بهذا المركز.", 404);
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      role: UserRole.PATIENT,
      OR: [
        {
          email: {
            startsWith: `${loginIdentifier}@`
          }
        },
        {
          phone: input.primaryPhone,
          patientProfile: {
            is: {
              centerId: legacyCenter.id
            }
          }
        }
      ]
    },
    include: {
      patientProfile: true
    }
  });

  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        email: patientEmail,
        passwordHash,
        fullName: input.fullName,
        phone: input.primaryPhone,
        isActive: true
      }
    });

    if (existingUser.patientProfile) {
      await prisma.patientProfile.update({
        where: { id: existingUser.patientProfile.id },
        data: {
          centerId: legacyCenter.id,
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          chronicConditions: formatChronicConditions(input.chronicDiseases),
          emergencyContact: input.emergencyContact
        }
      });
    } else {
      await prisma.patientProfile.create({
        data: {
          userId: existingUser.id,
          centerId: legacyCenter.id,
          medicalRecordNumber: buildMedicalRecordNumber(center.centerCode),
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          chronicConditions: formatChronicConditions(input.chronicDiseases),
          emergencyContact: input.emergencyContact
        }
      });
    }

    const deliveryMethod = await sendPatientPasswordSms({
      phone: input.primaryPhone,
      patientName: input.fullName,
      centerName: center.centerName,
      nationalId: loginIdentifier,
      temporaryPassword
    });

    return {
      loginIdentifier,
      deliveryMethod,
      accountStatus: "RESET"
    };
  }

  const user = await prisma.user.create({
    data: {
      email: patientEmail,
      passwordHash,
      fullName: input.fullName,
      phone: input.primaryPhone,
      role: UserRole.PATIENT,
      isActive: true
    }
  });

  await prisma.patientProfile.create({
    data: {
      userId: user.id,
      centerId: legacyCenter.id,
      medicalRecordNumber: buildMedicalRecordNumber(center.centerCode),
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      chronicConditions: formatChronicConditions(input.chronicDiseases),
      emergencyContact: input.emergencyContact
    }
  });

  const deliveryMethod = await sendPatientPasswordSms({
    phone: input.primaryPhone,
    patientName: input.fullName,
    centerName: center.centerName,
    nationalId: loginIdentifier,
    temporaryPassword
  });

  return {
    loginIdentifier,
    deliveryMethod,
    accountStatus: "CREATED"
  };
}

export async function syncPatientPortalProfile(input: SyncPatientPortalProfileInput) {
  const center = await prisma.centralCenter.findUnique({
    where: { id: input.centerId },
    select: {
      centerCode: true
    }
  });

  if (!center) {
    return;
  }

  const legacyCenter = await prisma.center.findUnique({
    where: { code: center.centerCode },
    select: {
      id: true
    }
  });

  if (!legacyCenter) {
    return;
  }

  const normalizedNationalId = input.nationalId ? normalizeNationalId(input.nationalId) : null;

  const existingUser = await prisma.user.findFirst({
    where: {
      role: UserRole.PATIENT,
      OR: [
        ...(normalizedNationalId
          ? [
              {
                email: {
                  startsWith: `${normalizedNationalId}@`
                }
              }
            ]
          : []),
        {
          phone: input.primaryPhone,
          patientProfile: {
            is: {
              centerId: legacyCenter.id
            }
          }
        }
      ]
    },
    include: {
      patientProfile: true
    }
  });

  if (!existingUser) {
    return;
  }

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      email: normalizedNationalId ? buildPatientEmail(normalizedNationalId) : existingUser.email,
      fullName: input.fullName,
      phone: input.primaryPhone
    }
  });

  if (existingUser.patientProfile) {
    await prisma.patientProfile.update({
      where: { id: existingUser.patientProfile.id },
      data: {
        centerId: legacyCenter.id,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        chronicConditions: formatChronicConditions(input.chronicDiseases),
        emergencyContact: input.emergencyContact
      }
    });
  }
}

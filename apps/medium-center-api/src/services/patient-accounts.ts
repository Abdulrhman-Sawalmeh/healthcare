import { Gender, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { buildCenterEmailAddress } from "../utils/account-identifiers";

const passwordLetters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const passwordDigits = "23456789";
const passwordAlphabet = `${passwordLetters}${passwordDigits}`;

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
  deliveryMethod: "TWILIO" | "WEBHOOK" | "OUTBOX";
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

function buildMedicalRecordNumber(centerCode: string) {
  const suffix = `${Date.now()}`.slice(-6);
  return `MRN-${centerCode}-${new Date().getFullYear()}-${suffix}`;
}

function pickRandom(value: string) {
  return value[randomInt(value.length)];
}

function shuffleCharacters(value: string[]) {
  for (let index = value.length - 1; index > 0; index -= 1) {
    const targetIndex = randomInt(index + 1);
    [value[index], value[targetIndex]] = [value[targetIndex], value[index]];
  }

  return value;
}

function generateTemporaryPassword(length = 8) {
  const safeLength = Math.min(Math.max(length, 2), 8);
  const characters = [
    pickRandom(passwordLetters),
    pickRandom(passwordDigits),
    ...Array.from({ length: safeLength - 2 }, () => pickRandom(passwordAlphabet))
  ];

  return shuffleCharacters(characters).join("");
}

function formatChronicConditions(chronicDiseases: string[]) {
  return chronicDiseases.length > 0 ? chronicDiseases.join("، ") : null;
}

async function fetchWithTimeout(url: string, options: RequestInit) {
  const timeoutMs = Number(process.env.SMS_TIMEOUT_MS ?? 10000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function appendSmsToOutbox(payload: {
  phone: string;
  patientName: string;
  nationalId: string;
  centerName: string;
  message: string;
}) {
  const outboxDir = path.resolve(__dirname, "../../../..", "runtime-logs");
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
  const smsProvider = process.env.SMS_PROVIDER?.trim().toLowerCase();
  const webhookUrl = process.env.SMS_WEBHOOK_URL?.trim();
  const apiKey = process.env.SMS_API_KEY?.trim();
  const senderName = process.env.SMS_SENDER_NAME?.trim() || "Healthcare";
  const message = `مرحبا ${input.patientName}، تم إنشاء حسابك في ${input.centerName}. رقم الهوية: ${input.nationalId}. كلمة المرور: ${input.temporaryPassword}`;
  const useTwilio = smsProvider === "twilio" || (!smsProvider && Boolean(process.env.TWILIO_ACCOUNT_SID));

  if (useTwilio) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
    const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

    if (accountSid && authToken && fromNumber) {
      try {
        const response = await fetchWithTimeout(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            headers: {
              authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
              "content-type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              To: input.phone,
              From: fromNumber,
              Body: message
            })
          }
        );

        if (response.ok) {
          return "TWILIO" as const;
        }

        console.error("Twilio SMS failed", await response.text());
      } catch (error) {
        console.error("Twilio SMS request failed", error);
      }
    } else {
      console.error("Twilio SMS is selected, but TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER is missing.");
    }
  }

  if (webhookUrl) {
    try {
      const response = await fetchWithTimeout(webhookUrl, {
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

      console.error("SMS webhook failed", await response.text());
    } catch (error) {
      console.error("SMS webhook request failed", error);
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
  const normalizedNationalId = normalizeNationalId(input.nationalId);
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

  const loginIdentifier = normalizedNationalId;
  const patientEmail = buildCenterEmailAddress(loginIdentifier, center.centerName);

  const existingUser = await prisma.user.findFirst({
    where: {
      role: UserRole.PATIENT,
      OR: [
        {
          email: {
            startsWith: `${normalizedNationalId}@`
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
      nationalId: normalizedNationalId,
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
    nationalId: normalizedNationalId,
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
      centerCode: true,
      centerName: true
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
      email: normalizedNationalId
        ? buildCenterEmailAddress(normalizedNationalId, center.centerName)
        : existingUser.email,
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

import { Gender, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { EmailDeliveryMethod, normalizeEmail, sendSystemEmail } from "./email-delivery";
import { buildCenterEmailAddress } from "../utils/account-identifiers";

const passwordLetters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const passwordDigits = "23456789";
const passwordAlphabet = `${passwordLetters}${passwordDigits}`;

export interface EnsurePatientPortalAccountInput {
  centerId: number;
  fullName: string;
  nationalId: string;
  email?: string;
  primaryPhone: string;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact?: string;
  chronicDiseases: string[];
}

export interface EnsurePatientPortalAccountResult {
  loginIdentifier: string;
  deliveryMethod: "TWILIO" | "WEBHOOK" | "OUTBOX";
  email: string | null;
  emailDeliveryMethod: EmailDeliveryMethod | "SKIPPED";
  accountStatus: "CREATED" | "RESET";
}

export interface SyncPatientPortalProfileInput {
  centerId: number;
  fullName: string;
  nationalId?: string;
  previousNationalId?: string | null;
  email?: string;
  primaryPhone: string;
  previousPhone?: string | null;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact?: string;
  chronicDiseases: string[];
}

export interface PatientPortalAccountLookupInput {
  centerCode: string;
  nationalId?: string | null;
  primaryPhone?: string | null;
}

export interface PrepareDemoPatientPortalLoginInput {
  centerId: number;
  fullName: string;
  nationalId: string;
  primaryPhone: string;
  dateOfBirth: Date;
  gender: Gender;
  emergencyContact?: string;
  chronicDiseases: string[];
}

export interface PrepareDemoPatientPortalLoginResult {
  loginIdentifier: string;
  demoPassword: string;
  accountStatus: "CREATED" | "RESET";
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

async function findLegacyCenterByCode(centerCode: string) {
  return prisma.center.findUnique({
    where: { code: centerCode },
    select: {
      id: true
    }
  });
}

function buildPatientPortalUserLookup(input: {
  legacyCenterId: string;
  nationalId?: string | null;
  previousNationalId?: string | null;
  primaryPhone?: string | null;
  previousPhone?: string | null;
  email?: string | null;
}) {
  const nationalIds = [
    input.nationalId ? normalizeNationalId(input.nationalId) : null,
    input.previousNationalId ? normalizeNationalId(input.previousNationalId) : null
  ].filter((value): value is string => Boolean(value));
  const phones = [input.primaryPhone, input.previousPhone].filter((value): value is string => Boolean(value));
  const email = normalizeEmail(input.email);

  return {
    role: UserRole.PATIENT,
    OR: [
      ...nationalIds.map((nationalId) => ({
        email: {
          startsWith: `${nationalId}@`
        }
      })),
      ...phones.map((phone) => ({
        phone,
        patientProfile: {
          is: {
            centerId: input.legacyCenterId
          }
        }
      })),
      ...(email ? [{ email }] : [])
    ]
  };
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

async function sendPatientWelcomeEmail(input: {
  email: string;
  patientName: string;
  centerName: string;
  nationalId: string;
  temporaryPassword: string;
}) {
  const subject = `مرحبا بك في ${input.centerName}`;
  const text = [
    `مرحبا ${input.patientName},`,
    `تم إنشاء حسابك في ${input.centerName}.`,
    `رقم الهوية: ${input.nationalId}`,
    `كلمة السر: ${input.temporaryPassword}`,
    "يمكنك تسجيل الدخول من بوابة المرضى باستخدام رقم الهوية أو البريد الإلكتروني."
  ].join("\n");

  return sendSystemEmail({
    to: input.email,
    subject,
    text,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8">
        <p>مرحبا ${input.patientName},</p>
        <p>تم إنشاء حسابك في <strong>${input.centerName}</strong>.</p>
        <p><strong>رقم الهوية:</strong> ${input.nationalId}</p>
        <p><strong>كلمة السر:</strong> ${input.temporaryPassword}</p>
        <p>يمكنك تسجيل الدخول من بوابة المرضى باستخدام رقم الهوية أو البريد الإلكتروني.</p>
      </div>
    `
  });
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

  const legacyCenter = await findLegacyCenterByCode(center.centerCode);

  if (!legacyCenter) {
    throw new AppError("تعذر العثور على بوابة المرضى الخاصة بهذا المركز.", 404);
  }

  const loginIdentifier = normalizedNationalId;
  const requestedEmail = normalizeEmail(input.email);
  const patientEmail = requestedEmail ?? buildCenterEmailAddress(loginIdentifier, center.centerName);

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
        },
        ...(requestedEmail
          ? [
              {
                email: requestedEmail
              }
            ]
          : [])
      ]
    },
    include: {
      patientProfile: true
    }
  });

  if (requestedEmail) {
    const emailOwner = await prisma.user.findFirst({
      where: {
        email: requestedEmail,
        ...(existingUser ? { NOT: { id: existingUser.id } } : {})
      },
      select: {
        id: true
      }
    });

    if (emailOwner) {
      throw new AppError("هذا البريد الإلكتروني مستخدم لحساب آخر.", 409);
    }
  }

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

    const [deliveryMethod, emailDeliveryMethod] = await Promise.all([
      sendPatientPasswordSms({
        phone: input.primaryPhone,
        patientName: input.fullName,
        centerName: center.centerName,
        nationalId: normalizedNationalId,
        temporaryPassword
      }),
      requestedEmail
        ? sendPatientWelcomeEmail({
            email: requestedEmail,
            patientName: input.fullName,
            centerName: center.centerName,
            nationalId: normalizedNationalId,
            temporaryPassword
          })
        : Promise.resolve("SKIPPED" as const)
    ]);

    return {
      loginIdentifier,
      deliveryMethod,
      email: requestedEmail ?? null,
      emailDeliveryMethod,
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

  const [deliveryMethod, emailDeliveryMethod] = await Promise.all([
    sendPatientPasswordSms({
      phone: input.primaryPhone,
      patientName: input.fullName,
      centerName: center.centerName,
      nationalId: normalizedNationalId,
      temporaryPassword
    }),
    requestedEmail
      ? sendPatientWelcomeEmail({
          email: requestedEmail,
          patientName: input.fullName,
          centerName: center.centerName,
          nationalId: normalizedNationalId,
          temporaryPassword
        })
      : Promise.resolve("SKIPPED" as const)
  ]);

  return {
    loginIdentifier,
    deliveryMethod,
    email: requestedEmail ?? null,
    emailDeliveryMethod,
    accountStatus: "CREATED"
  };
}

// Demo/local testing only. This returns a predictable password to the authorized caller
// and must remain disabled outside controlled development environments.
export async function prepareDemoPatientPortalLogin(
  input: PrepareDemoPatientPortalLoginInput
): Promise<PrepareDemoPatientPortalLoginResult> {
  const normalizedNationalId = normalizeNationalId(input.nationalId);
  const demoPassword = `Demo@${normalizedNationalId}`;
  const passwordHash = await bcrypt.hash(demoPassword, 10);

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
        passwordHash,
        isActive: true
      }
    });

    if (!existingUser.patientProfile) {
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

    return {
      loginIdentifier: normalizedNationalId,
      demoPassword,
      accountStatus: "RESET"
    };
  }

  const email = buildCenterEmailAddress(normalizedNationalId, center.centerName);
  const emailOwner = await prisma.user.findUnique({
    where: { email },
    select: { id: true }
  });

  if (emailOwner) {
    throw new AppError("تعذر تجهيز حساب تجريبي لأن معرف الدخول مرتبط بحساب آخر.", 409);
  }

  const user = await prisma.user.create({
    data: {
      email,
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

  return {
    loginIdentifier: normalizedNationalId,
    demoPassword,
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
  const requestedEmail = normalizeEmail(input.email);

  const existingUser = await prisma.user.findFirst({
    where: buildPatientPortalUserLookup({
      legacyCenterId: legacyCenter.id,
      nationalId: input.nationalId,
      previousNationalId: input.previousNationalId,
      primaryPhone: input.primaryPhone,
      previousPhone: input.previousPhone,
      email: requestedEmail
    }),
    include: {
      patientProfile: true
    }
  });

  if (!existingUser) {
    return;
  }

  if (requestedEmail) {
    const emailOwner = await prisma.user.findFirst({
      where: {
        email: requestedEmail,
        NOT: {
          id: existingUser.id
        }
      },
      select: {
        id: true
      }
    });

    if (emailOwner) {
      throw new AppError("هذا البريد الإلكتروني مستخدم لحساب آخر.", 409);
    }
  }

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      email: requestedEmail ?? (normalizedNationalId
        ? buildCenterEmailAddress(normalizedNationalId, center.centerName)
        : existingUser.email),
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

export async function getPatientPortalAccount(input: PatientPortalAccountLookupInput) {
  const legacyCenter = await findLegacyCenterByCode(input.centerCode);

  if (!legacyCenter) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: buildPatientPortalUserLookup({
      legacyCenterId: legacyCenter.id,
      nationalId: input.nationalId,
      primaryPhone: input.primaryPhone
    }),
    select: {
      id: true,
      email: true
    }
  });

  return user;
}

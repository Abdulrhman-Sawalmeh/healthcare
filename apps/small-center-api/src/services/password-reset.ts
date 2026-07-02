import { PasswordResetCode, Prisma, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";

import { isWorkspaceAllowed, systemConfig } from "../config/system";
import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { EmailDeliveryMethod, normalizeEmail, sendSystemEmail } from "./email-delivery";

type ResetAccountType = "CENTRAL" | "CENTER" | "LEGACY";

interface ResetAccount {
  accountType: ResetAccountType;
  accountId: string;
  email: string;
  fullName: string;
}

const RESET_CODE_TTL_MINUTES = 10;
const RESET_TOKEN_TTL_MINUTES = 10;
const MAX_RESET_ATTEMPTS = 5;

function createResetCode() {
  return String(randomInt(100000, 1000000));
}

function createResetToken() {
  return randomBytes(32).toString("hex");
}

async function findResetAccountByEmail(email: string): Promise<ResetAccount | null> {
  if (systemConfig.workspace === "central") {
    const centralUser = await prisma.centralUser.findFirst({
      where: {
        email,
        isActive: true
      }
    });

    return centralUser
      ? {
          accountType: "CENTRAL",
          accountId: String(centralUser.id),
          email: centralUser.email,
          fullName: centralUser.fullName
        }
      : null;
  }

  const centerUser = await prisma.centerUserAccount.findFirst({
    where: {
      email,
      isActive: true,
      ...(systemConfig.allowedCenterCode
        ? {
            center: {
              centerCode: systemConfig.allowedCenterCode
            }
          }
        : {})
    }
  });

  if (centerUser) {
    return {
      accountType: "CENTER",
      accountId: String(centerUser.id),
      email: centerUser.email!,
      fullName: centerUser.fullName
    };
  }

  const patient = await prisma.user.findFirst({
    where: {
      email,
      isActive: true,
      role: UserRole.PATIENT,
      patientProfile: {
        is: {
          ...(systemConfig.allowedCenterCode
            ? {
                center: {
                  code: systemConfig.allowedCenterCode
                }
              }
            : {})
        }
      }
    },
    include: {
      patientProfile: {
        include: {
          center: true
        }
      }
    }
  });

  if (!patient?.patientProfile || !isWorkspaceAllowed("legacy", patient.patientProfile.center.code)) {
    return null;
  }

  return {
    accountType: "LEGACY",
    accountId: patient.id,
    email: patient.email,
    fullName: patient.fullName
  };
}

async function sendResetCodeEmail(input: { email: string; fullName: string; code: string }) {
  const subject = "رمز التحقق لإعادة تعيين كلمة السر";
  const text = [
    `مرحبا ${input.fullName},`,
    `رمز التحقق لإعادة تعيين كلمة السر هو: ${input.code}`,
    `ينتهي الرمز خلال ${RESET_CODE_TTL_MINUTES} دقائق.`,
    "إذا لم تطلب إعادة تعيين كلمة السر، تجاهل هذه الرسالة."
  ].join("\n");

  return sendSystemEmail({
    to: input.email,
    subject,
    text,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.8">
        <p>مرحبا ${input.fullName},</p>
        <p>رمز التحقق لإعادة تعيين كلمة السر هو:</p>
        <p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${input.code}</p>
        <p>ينتهي الرمز خلال ${RESET_CODE_TTL_MINUTES} دقائق.</p>
        <p>إذا لم تطلب إعادة تعيين كلمة السر، تجاهل هذه الرسالة.</p>
      </div>
    `
  });
}

export async function requestPasswordReset(emailInput: string): Promise<{
  accountFound: boolean;
  deliveryMethod: EmailDeliveryMethod | "SKIPPED";
}> {
  const email = normalizeEmail(emailInput);

  if (!email) {
    throw new AppError("أدخل بريدا إلكترونيا صالحا.", 400);
  }

  const account = await findResetAccountByEmail(email);

  if (!account) {
    return {
      accountFound: false,
      deliveryMethod: "SKIPPED"
    };
  }

  const code = createResetCode();
  const codeHash = await bcrypt.hash(code, 10);
  const now = new Date();

  await prisma.passwordResetCode.updateMany({
    where: {
      email,
      consumedAt: null
    },
    data: {
      consumedAt: now
    }
  });

  await prisma.passwordResetCode.create({
    data: {
      accountType: account.accountType,
      accountId: account.accountId,
      email,
      codeHash,
      expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MINUTES * 60 * 1000)
    }
  });

  const deliveryMethod = await sendResetCodeEmail({
    email,
    fullName: account.fullName,
    code
  });

  return {
    accountFound: true,
    deliveryMethod
  };
}

async function findLatestActiveReset(email: string) {
  return prisma.passwordResetCode.findFirst({
    where: {
      email,
      consumedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

async function assertValidResetCode(email: string, code: string) {
  const reset = await findLatestActiveReset(email);

  if (!reset) {
    throw new AppError("رمز التحقق منتهي أو غير صحيح.", 400);
  }

  if (reset.attempts >= MAX_RESET_ATTEMPTS) {
    throw new AppError("تم تجاوز عدد محاولات التحقق. اطلب رمزا جديدا.", 429);
  }

  const isValidCode = await bcrypt.compare(code, reset.codeHash);

  if (!isValidCode) {
    await prisma.passwordResetCode.update({
      where: { id: reset.id },
      data: {
        attempts: {
          increment: 1
        }
      }
    });
    throw new AppError("رمز التحقق غير صحيح.", 400);
  }

  return reset;
}

export async function verifyPasswordResetCode(input: { email: string; code: string }) {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();

  if (!email || code.length < 4) {
    throw new AppError("رمز التحقق أو البريد الإلكتروني غير صالح.", 400);
  }

  const reset = await assertValidResetCode(email, code);
  const resetToken = createResetToken();
  const resetTokenHash = await bcrypt.hash(resetToken, 10);
  const resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.passwordResetCode.update({
    where: { id: reset.id },
    data: {
      verifiedAt: new Date(),
      resetTokenHash,
      resetTokenExpiresAt
    }
  });

  return {
    resetToken,
    resetTokenExpiresAt
  };
}

async function updateAccountPassword(tx: Prisma.TransactionClient, reset: PasswordResetCode, passwordHash: string) {
  if (reset.accountType === "CENTRAL") {
    await tx.centralUser.update({
      where: { id: Number(reset.accountId) },
      data: { passwordHash }
    });
    return;
  }

  if (reset.accountType === "CENTER") {
    await tx.centerUserAccount.update({
      where: { id: Number(reset.accountId) },
      data: { passwordHash }
    });
    return;
  }

  if (reset.accountType === "LEGACY") {
    await tx.user.update({
      where: { id: reset.accountId },
      data: { passwordHash }
    });
    return;
  }

  throw new AppError("نوع الحساب غير مدعوم لإعادة تعيين كلمة السر.", 400);
}

export async function confirmPasswordReset(input: { email: string; resetToken: string; newPassword: string }) {
  const email = normalizeEmail(input.email);
  const resetToken = input.resetToken.trim();

  if (!email || resetToken.length < 32) {
    throw new AppError("جلسة إعادة تعيين كلمة السر غير صالحة.", 400);
  }

  const reset = await prisma.passwordResetCode.findFirst({
    where: {
      email,
      consumedAt: null,
      verifiedAt: {
        not: null
      },
      resetTokenHash: {
        not: null
      },
      resetTokenExpiresAt: {
        gt: new Date()
      }
    },
    orderBy: {
      verifiedAt: "desc"
    }
  });

  if (!reset?.resetTokenHash) {
    throw new AppError("يجب التحقق من الرمز قبل إعادة تعيين كلمة السر.", 400);
  }

  const isValidToken = await bcrypt.compare(resetToken, reset.resetTokenHash);

  if (!isValidToken) {
    throw new AppError("جلسة إعادة تعيين كلمة السر غير صالحة.", 400);
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await prisma.$transaction(async (tx) => {
    await updateAccountPassword(tx, reset, passwordHash);
    await tx.passwordResetCode.update({
      where: { id: reset.id },
      data: {
        consumedAt: new Date(),
        resetTokenHash: null,
        resetTokenExpiresAt: null
      }
    });
  });
}

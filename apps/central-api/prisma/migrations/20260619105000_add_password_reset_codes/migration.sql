CREATE TABLE "PasswordResetCode" (
  "id" SERIAL NOT NULL,
  "accountType" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "resetTokenHash" TEXT,
  "resetTokenExpiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PasswordResetCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PasswordResetCode_email_accountType_expiresAt_idx" ON "PasswordResetCode"("email", "accountType", "expiresAt");
CREATE INDEX "PasswordResetCode_email_resetTokenExpiresAt_idx" ON "PasswordResetCode"("email", "resetTokenExpiresAt");
CREATE INDEX "PasswordResetCode_accountType_accountId_consumedAt_idx" ON "PasswordResetCode"("accountType", "accountId", "consumedAt");

ALTER TABLE "PasswordResetCode"
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "resetTokenHash" TEXT,
ADD COLUMN "resetTokenExpiresAt" TIMESTAMP(3);

CREATE INDEX "PasswordResetCode_email_resetTokenExpiresAt_idx" ON "PasswordResetCode"("email", "resetTokenExpiresAt");

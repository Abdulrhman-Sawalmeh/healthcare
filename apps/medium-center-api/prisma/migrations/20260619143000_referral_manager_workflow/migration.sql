ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'REQUESTED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'AUTO_SELECTED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'NO_CANDIDATE_REJECTED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'PENDING_RECEIVING_MANAGER';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'RECEIVING_MANAGER_ACCEPTED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'RECEIVING_MANAGER_REJECTED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED_TO_DOCTOR';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'VISIT_CREATED';
ALTER TYPE "NetworkReferralStatus" ADD VALUE IF NOT EXISTS 'RETURNED_WITH_REASON';

ALTER TABLE "CentralReferral"
  ADD COLUMN IF NOT EXISTS "managerDecisionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "matchingScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "assignedDoctorId" INTEGER,
  ADD COLUMN IF NOT EXISTS "acceptedByManagerId" INTEGER,
  ADD COLUMN IF NOT EXISTS "rejectedByManagerId" INTEGER,
  ADD COLUMN IF NOT EXISTS "decisionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "assignedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "visitCreatedAt" TIMESTAMP(3);

ALTER TABLE "LocalVisit"
  ADD COLUMN IF NOT EXISTS "visitSource" TEXT NOT NULL DEFAULT 'LOCAL',
  ADD COLUMN IF NOT EXISTS "referralId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "LocalVisit_referralId_key" ON "LocalVisit"("referralId");
CREATE INDEX IF NOT EXISTS "CentralReferral_assignedDoctorId_status_idx" ON "CentralReferral"("assignedDoctorId", "status");
CREATE INDEX IF NOT EXISTS "LocalVisit_referralId_idx" ON "LocalVisit"("referralId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CentralReferral_assignedDoctorId_fkey'
  ) THEN
    ALTER TABLE "CentralReferral"
      ADD CONSTRAINT "CentralReferral_assignedDoctorId_fkey"
      FOREIGN KEY ("assignedDoctorId") REFERENCES "CenterUserAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CentralReferral_acceptedByManagerId_fkey'
  ) THEN
    ALTER TABLE "CentralReferral"
      ADD CONSTRAINT "CentralReferral_acceptedByManagerId_fkey"
      FOREIGN KEY ("acceptedByManagerId") REFERENCES "CenterUserAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CentralReferral_rejectedByManagerId_fkey'
  ) THEN
    ALTER TABLE "CentralReferral"
      ADD CONSTRAINT "CentralReferral_rejectedByManagerId_fkey"
      FOREIGN KEY ("rejectedByManagerId") REFERENCES "CenterUserAccount"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LocalVisit_referralId_fkey'
  ) THEN
    ALTER TABLE "LocalVisit"
      ADD CONSTRAINT "LocalVisit_referralId_fkey"
      FOREIGN KEY ("referralId") REFERENCES "CentralReferral"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

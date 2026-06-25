ALTER TABLE "LocalPrescription"
  ADD COLUMN IF NOT EXISTS "pharmacyStatus" TEXT NOT NULL DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS "availabilityStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS "pharmacistNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "unavailableReason" TEXT,
  ADD COLUMN IF NOT EXISTS "doctorReviewReason" TEXT,
  ADD COLUMN IF NOT EXISTS "doctorReviewResponse" TEXT,
  ADD COLUMN IF NOT EXISTS "preparationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "readyForPickupAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "doctorReviewRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "doctorReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pharmacyUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "LocalPrescription_pharmacyStatus_pharmacyUpdatedAt_idx"
  ON "LocalPrescription"("pharmacyStatus", "pharmacyUpdatedAt");

ALTER TABLE "PharmacyInventoryLocal"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

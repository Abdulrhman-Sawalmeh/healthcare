UPDATE "LocalPrescription"
SET
  "pharmacyStatus" = 'DISPENSED',
  "availabilityStatus" = 'AVAILABLE',
  "pharmacyUpdatedAt" = COALESCE("dispensedAt", "issuedAt")
WHERE "dispensed" = TRUE
  AND "pharmacyStatus" = 'NEW';

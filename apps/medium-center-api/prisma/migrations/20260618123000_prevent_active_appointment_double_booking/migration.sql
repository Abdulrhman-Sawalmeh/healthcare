CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_doctorId_scheduledAt_active_key"
ON "Appointment"("doctorId", "scheduledAt")
WHERE "status" <> 'CANCELLED';

import crypto from "crypto";

export function createPrescriptionVerificationCode(centerId: number, visitId: number, sequence: number) {
  const randomPart = crypto.randomBytes(4).toString("hex").toUpperCase();
  const timePart = Date.now().toString(36).toUpperCase();

  return `RX-${centerId}-${visitId}-${sequence + 1}-${timePart}-${randomPart}`;
}

export function hashPrescriptionVerificationCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function buildPrescriptionQrValue(code: string) {
  return `healthcare-prescription:${code}`;
}

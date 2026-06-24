import { randomUUID } from "crypto";

const PATIENT_QR_PREFIX = "healthcare-patient";

export function createPatientQrToken() {
  return randomUUID();
}

export function buildPatientQrValue(qrToken: string) {
  return `${PATIENT_QR_PREFIX}:${qrToken}`;
}

export function parsePatientQrToken(value: string) {
  const trimmed = value.trim();
  const parts = trimmed.split(":");

  if (parts.length === 2 && parts[0] === PATIENT_QR_PREFIX) {
    return parts[1];
  }

  if (parts.length === 3 && parts[0] === PATIENT_QR_PREFIX) {
    return parts[2];
  }

  return trimmed;
}

export function buildPatientQrImageUrl(qrValue: string, size = 240) {
  const safeSize = Math.max(160, Math.min(size, 420));

  return `https://api.qrserver.com/v1/create-qr-code/?size=${safeSize}x${safeSize}&data=${encodeURIComponent(qrValue)}`;
}

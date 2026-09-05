import { Prisma } from "@prisma/client";

export const centralCenterWithoutApiKeySelect = {
  id: true,
  centerCode: true,
  centerName: true,
  centerType: true,
  region: true,
  city: true,
  address: true,
  phone: true,
  email: true,
  latitude: true,
  longitude: true,
  specialties: true,
  isConnected: true,
  connectionSuspendedAt: true,
  suspensionReason: true,
  apiEndpoint: true,
  lastSyncAt: true,
  registeredAt: true
} satisfies Prisma.CentralCenterSelect;

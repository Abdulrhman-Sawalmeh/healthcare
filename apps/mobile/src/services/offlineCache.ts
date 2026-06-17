import AsyncStorage from "@react-native-async-storage/async-storage";

import { PortalMedicalRecord } from "../types";

const PATIENT_RECORD_CACHE_KEY = "healthcare.medium.mobile.patient.offline-record";

export interface OfflinePatientSnapshot {
  cachedAt: string;
  record: PortalMedicalRecord;
}

function sanitizeMedicalRecord(record: PortalMedicalRecord): PortalMedicalRecord {
  return {
    ...record,
    clinicalReports: [],
    referrals: [],
    subscriptions: [],
    eligiblePrescriptions: (record.eligiblePrescriptions ?? []).slice(0, 8),
    medicationRefills: (record.medicationRefills ?? []).slice(0, 8),
    followUpReminders: (record.followUpReminders ?? []).slice(0, 8),
    upcomingAppointments: (record.upcomingAppointments ?? []).slice(0, 8)
  };
}

export async function writePatientOfflineSnapshot(record: PortalMedicalRecord) {
  const snapshot: OfflinePatientSnapshot = {
    cachedAt: new Date().toISOString(),
    record: sanitizeMedicalRecord(record)
  };

  await AsyncStorage.setItem(PATIENT_RECORD_CACHE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function readPatientOfflineSnapshot() {
  const raw = await AsyncStorage.getItem(PATIENT_RECORD_CACHE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as OfflinePatientSnapshot;
  } catch {
    await AsyncStorage.removeItem(PATIENT_RECORD_CACHE_KEY);
    return null;
  }
}

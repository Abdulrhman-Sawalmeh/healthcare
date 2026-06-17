import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";
import { createSimplePdf } from "./simple-pdf";

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not recorded";
  }

  return date.toISOString().slice(0, 10);
}

function listValue(values: string[]) {
  return values.length > 0 ? values.join(", ") : "None recorded";
}

function nullableValue(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

export async function buildPatientSummaryPdf(centerId: number, patientId: number) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    include: {
      center: {
        select: {
          centerName: true,
          centerCode: true
        }
      }
    }
  });

  if (!patient) {
    throw new AppError("Patient was not found in this center.", 404);
  }

  const [visits, labResults, prescriptions] = await Promise.all([
    prisma.localVisit.findMany({
      where: {
        centerId,
        patientId
      },
      include: {
        doctor: {
          select: {
            fullName: true
          }
        }
      },
      orderBy: {
        visitDate: "desc"
      },
      take: 5
    }),
    prisma.labRequestLocal.findMany({
      where: {
        centerId,
        patientId,
        status: "COMPLETED",
        resultValue: {
          not: null
        }
      },
      include: {
        test: true,
        doctor: {
          select: {
            fullName: true
          }
        }
      },
      orderBy: {
        resultDate: "desc"
      },
      take: 5
    }),
    prisma.localPrescription.findMany({
      where: {
        visit: {
          centerId,
          patientId
        }
      },
      include: {
        visit: {
          include: {
            doctor: {
              select: {
                fullName: true
              }
            }
          }
        }
      },
      orderBy: {
        issuedAt: "desc"
      },
      take: 10
    })
  ]);

  const lines = [
    "This summary is generated from the Healthcare Ecosystem and must be reviewed by authorized medical staff.",
    "",
    "Patient Basic Info",
    `Patient name: ${patient.fullName}`,
    `Local patient ID: ${patient.id}`,
    `Unified ID: ${patient.unifiedId ?? "Not linked"}`,
    `Date of birth: ${formatDate(patient.dateOfBirth)}`,
    `Gender: ${patient.gender}`,
    `Phone: ${patient.phone}`,
    `Blood type: ${nullableValue(patient.bloodType)}`,
    `Emergency contact: ${nullableValue(patient.emergencyContact)}`,
    `Center: ${patient.center.centerName} (${patient.center.centerCode})`,
    "",
    "Allergies",
    listValue(patient.allergies),
    "",
    "Chronic Diseases",
    listValue(patient.chronicDiseases),
    "",
    "Latest Visits",
    ...(visits.length > 0
      ? visits.map(
          (visit) =>
            `${formatDate(visit.visitDate)} - ${visit.visitType} - ${visit.diagnosis} - Doctor: ${visit.doctor?.fullName ?? "Not assigned"}`
        )
      : ["No visits recorded."]),
    "",
    "Latest Lab Results",
    ...(labResults.length > 0
      ? labResults.map(
          (lab) =>
            `${formatDate(lab.resultDate ?? lab.requestDate)} - ${lab.test.testName}: ${lab.resultValue ?? "Not recorded"}${lab.test.normalRange ? ` (Normal: ${lab.test.normalRange})` : ""} - Doctor: ${lab.doctor.fullName}`
        )
      : ["No completed lab results recorded."]),
    "",
    "Current / Recent Medications and Prescriptions",
    ...(prescriptions.length > 0
      ? prescriptions.map(
          (prescription) =>
            `${formatDate(prescription.issuedAt)} - ${prescription.medicineName} - ${prescription.dosage} - ${prescription.duration} - Doctor: ${prescription.visit.doctor?.fullName ?? "Not assigned"}`
        )
      : ["No prescriptions recorded."]),
    "",
    `Generated at: ${new Date().toISOString()}`
  ];

  return {
    fileName: `patient-${patient.id}-summary.pdf`,
    buffer: createSimplePdf({
      title: "Patient Health Summary",
      lines
    })
  };
}

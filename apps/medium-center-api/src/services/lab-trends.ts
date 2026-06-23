import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

function parseNumericLabValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const match = value.replace(",", ".").match(/-?\d+(\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getPatientLabTrend(centerId: number, patientId: number, testName?: string | null) {
  const patient = await prisma.localPatient.findFirst({
    where: {
      id: patientId,
      centerId
    },
    select: {
      id: true
    }
  });

  if (!patient) {
    throw new AppError("Patient was not found in this center.", 404);
  }

  const availableTests = await prisma.labTestLocal.findMany({
    where: {
      centerId,
      requests: {
        some: {
          centerId,
          patientId,
          status: "COMPLETED",
          resultValue: {
            not: null
          }
        }
      }
    },
    select: {
      testName: true
    },
    orderBy: {
      testName: "asc"
    }
  });

  const uniqueTests = Array.from(new Set(availableTests.map((test) => test.testName)));
  const selectedTestName = testName?.trim() || uniqueTests[0] || null;

  if (!selectedTestName) {
    return {
      testName: null,
      unit: null,
      normalRange: null,
      availableTests: uniqueTests,
      points: []
    };
  }

  const labResults = await prisma.labRequestLocal.findMany({
    where: {
      centerId,
      patientId,
      status: "COMPLETED",
      resultValue: {
        not: null
      },
      test: {
        testName: {
          equals: selectedTestName,
          mode: "insensitive"
        }
      }
    },
    select: {
      id: true,
      requestDate: true,
      resultDate: true,
      resultValue: true,
      test: {
        select: {
          normalRange: true
        }
      }
    },
    orderBy: {
      resultDate: "asc"
    }
  });

  const points = labResults
    .map((result) => {
      const value = parseNumericLabValue(result.resultValue);

      if (value === null) {
        return null;
      }

      return {
        date: (result.resultDate ?? result.requestDate).toISOString(),
        value,
        rawValue: result.resultValue
      };
    })
    .filter((point): point is { date: string; value: number; rawValue: string | null } => point !== null);

  return {
    testName: selectedTestName,
    unit: null,
    normalRange: labResults[0]?.test.normalRange ?? null,
    availableTests: uniqueTests,
    points
  };
}

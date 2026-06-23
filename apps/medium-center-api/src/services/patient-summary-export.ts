import fs from "fs";

import PDFDocument from "pdfkit";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "غير مسجل";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "غير مسجل";

  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function listValue(values: string[]) {
  return values.length > 0 ? values.join("، ") : "لا توجد بيانات مسجلة";
}

function nullableValue(value: string | null | undefined) {
  return value?.trim() || "غير مسجل";
}

function findArabicFont() {
  const candidates = [
    "C:\\Windows\\Fonts\\tahoma.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf"
  ];

  return candidates.find((fontPath) => fs.existsSync(fontPath)) ?? null;
}

function asRtlText(value: string) {
  return `\u202B${value}\u202C`;
}

function writeLine(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(asRtlText(text), {
    align: "right",
    lineGap: 4,
    ...options
  });
}

function writeSection(doc: PDFKit.PDFDocument, title: string, lines: string[]) {
  doc.moveDown(0.8);
  doc.fontSize(15).fillColor("#0f7663");
  writeLine(doc, title);
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#17322d");

  for (const line of lines) {
    writeLine(doc, line);
  }
}

async function createSummaryPdf(params: { title: string; subtitle: string; sections: Array<{ title: string; lines: string[] }> }) {
  const fontPath = findArabicFont();
  const doc = new PDFDocument({
    size: "A4",
    margins: {
      top: 48,
      right: 48,
      bottom: 48,
      left: 48
    },
    info: {
      Title: params.title,
      Creator: "Healthcare Ecosystem"
    }
  });
  const chunks: Buffer[] = [];

  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (fontPath) {
    doc.font(fontPath);
  }

  doc.fontSize(19).fillColor("#0f3d36");
  writeLine(doc, params.title);
  doc.moveDown(0.25);
  doc.fontSize(11).fillColor("#5e7a72");
  writeLine(doc, params.subtitle);

  for (const section of params.sections) {
    writeSection(doc, section.title, section.lines);
  }

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#5e7a72");
  writeLine(doc, `تم إنشاء الملف: ${formatDate(new Date())}`);
  doc.end();

  return done;
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
    throw new AppError("لم يتم العثور على ملف المريض داخل هذا المركز.", 404);
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

  const sections = [
    {
      title: "البيانات الأساسية",
      lines: [
        `اسم المريض: ${patient.fullName}`,
        `رقم الملف الداخلي: ${patient.id}`,
        `الرقم الموحد: ${patient.unifiedId ?? "غير مرتبط"}`,
        `تاريخ الميلاد: ${formatDate(patient.dateOfBirth)}`,
        `الجنس: ${patient.gender}`,
        `الهاتف: ${patient.phone}`,
        `فصيلة الدم: ${nullableValue(patient.bloodType)}`,
        `جهة اتصال الطوارئ: ${nullableValue(patient.emergencyContact)}`,
        `المركز: ${patient.center.centerName} (${patient.center.centerCode})`
      ]
    },
    {
      title: "الحساسيات والأمراض المزمنة",
      lines: [`الحساسيات: ${listValue(patient.allergies)}`, `الأمراض المزمنة: ${listValue(patient.chronicDiseases)}`]
    },
    {
      title: "آخر الزيارات",
      lines:
        visits.length > 0
          ? visits.map(
              (visit) =>
                `${formatDate(visit.visitDate)} • ${visit.visitType} • ${visit.diagnosis} • الطبيب: ${
                  visit.doctor?.fullName ?? "غير محدد"
                }`
            )
          : ["لا توجد زيارات مسجلة."]
    },
    {
      title: "آخر نتائج المختبر",
      lines:
        labResults.length > 0
          ? labResults.map(
              (lab) =>
                `${formatDate(lab.resultDate ?? lab.requestDate)} • ${lab.test.testName}: ${
                  lab.resultValue ?? "غير مسجل"
                }${lab.test.normalRange ? ` • المدى الطبيعي: ${lab.test.normalRange}` : ""} • الطبيب: ${lab.doctor.fullName}`
            )
          : ["لا توجد نتائج مختبر مكتملة."]
    },
    {
      title: "الوصفات والأدوية الحديثة",
      lines:
        prescriptions.length > 0
          ? prescriptions.map(
              (prescription) =>
                `${formatDate(prescription.issuedAt)} • ${prescription.medicineName} • ${prescription.dosage} • ${
                  prescription.duration
                } • الطبيب: ${prescription.visit.doctor?.fullName ?? "غير محدد"}`
            )
          : ["لا توجد وصفات مسجلة."]
    }
  ];

  return {
    fileName: `patient-${patient.id}-summary.pdf`,
    buffer: await createSummaryPdf({
      title: "ملخص ملف المريض",
      subtitle: "ملخص صادر من نظام Healthcare Ecosystem ويجب مراجعته من الطاقم الطبي المخول.",
      sections
    })
  };
}

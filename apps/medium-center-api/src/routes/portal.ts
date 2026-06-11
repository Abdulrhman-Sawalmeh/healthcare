import { AppointmentStatus, SubscriptionStatus, UserRole } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middleware/auth";
import { AppError } from "../middleware/error";
import { asyncHandler } from "../utils/async-handler";
import {
  mapAppointment,
  mapDoctor,
  mapPatient,
  mapReferral,
  mapSubscription,
  mapThread
} from "../utils/serializers";
import { requireProfileId } from "../utils/scope";
import { appointmentsRouter } from "./appointments";
import { centersRouter } from "./centers";
import { communicationsRouter } from "./communications";
import { doctorsRouter } from "./doctors";
import { notificationsRouter } from "./notifications";
import { patientsRouter } from "./patients";
import { referralsRouter } from "./referrals";
import { subscriptionsRouter } from "./subscriptions";

const router = Router();

const appointmentInclude = {
  center: true,
  department: true,
  patient: {
    include: {
      user: true
    }
  },
  doctor: {
    include: {
      user: true,
      department: true
    }
  }
} as const;

const referralInclude = {
  fromCenter: true,
  toCenter: true,
  patient: {
    include: {
      user: true
    }
  },
  fromDoctor: {
    include: {
      user: true
    }
  },
  toDoctor: {
    include: {
      user: true
    }
  },
  department: true
} as const;

const subscriptionInclude = {
  center: true,
  plan: true,
  patient: {
    include: {
      user: true
    }
  },
  payments: {
    orderBy: {
      createdAt: "desc"
    }
  }
} as const;

const threadInclude = {
  patient: {
    include: {
      user: true
    }
  },
  doctor: {
    include: {
      user: true,
      department: true
    }
  },
  messages: {
    include: {
      sender: true
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} as const;

const localResultReportInclude = {
  center: true,
  author: {
    include: {
      doctorProfile: true
    }
  }
} as const;

function mapAppointmentAsClinicalReport(
  appointment: Parameters<typeof mapAppointment>[0]
) {
  const mapped = mapAppointment(appointment);

  return {
    ...mapped,
    source: "APPOINTMENT",
    summary: appointment.notes ?? null,
    findings: null,
    recommendations: null,
    recommendedFollowUp: null,
    attachment: null
  };
}

function mapLocalResultReport(
  report: {
    id: number;
    title: string;
    category: string;
    summary: string;
    findings: string | null;
    recommendations: string | null;
    recommendedFollowUp: string | null;
    createdAt: Date;
    authorId: number;
    attachmentFileName: string | null;
    attachmentMimeType: string | null;
    attachmentBase64: string | null;
    center: {
      id: number;
      centerName: string;
    };
    author: {
      fullName: string;
      doctorProfile: {
        specialization: string;
      } | null;
    };
  },
  patient: {
    id: string;
    fullName: string;
    medicalRecordNumber: string;
  },
  includeAttachmentData: boolean
) {
  return {
    id: `local-report-${report.id}`,
    status: "AVAILABLE",
    type: report.category,
    scheduledAt: report.createdAt,
    reason: report.title,
    notes: report.summary,
    source: "RESULT_REPORT",
    summary: report.summary,
    findings: report.findings,
    recommendations: report.recommendations,
    recommendedFollowUp: report.recommendedFollowUp,
    center: {
      id: String(report.center.id),
      name: report.center.centerName
    },
    department: {
      id: `specialty-${report.authorId}`,
      name: report.author.doctorProfile?.specialization ?? "التقرير الطبي"
    },
    patient,
    doctor: {
      id: String(report.authorId),
      fullName: report.author.fullName,
      specialization: report.author.doctorProfile?.specialization ?? "طبيب معالج"
    },
    attachment:
      report.attachmentFileName && report.attachmentMimeType
        ? {
            fileName: report.attachmentFileName,
            mimeType: report.attachmentMimeType,
            contentBase64: includeAttachmentData ? report.attachmentBase64 : null
          }
        : null
  };
}

async function getPatientLocalResultReports(
  patient: {
    id: string;
    medicalRecordNumber: string;
    center: {
      code: string;
    };
    user: {
      phone: string | null;
      fullName: string;
    };
  },
  includeAttachmentData: boolean
) {
  const centralCenter = await prisma.centralCenter.findUnique({
    where: {
      centerCode: patient.center.code
    },
    select: {
      id: true
    }
  });

  if (!centralCenter) {
    return [];
  }

  const localPatient = await prisma.localPatient.findFirst({
    where: {
      centerId: centralCenter.id,
      OR: [
        ...(patient.user.phone ? [{ phone: patient.user.phone }] : []),
        {
          fullName: patient.user.fullName
        }
      ]
    }
  });

  if (!localPatient) {
    return [];
  }

  const reports = await prisma.localResultReport.findMany({
    where: {
      centerId: centralCenter.id,
      patientId: localPatient.id,
      shareWithPatient: true
    },
    include: localResultReportInclude,
    orderBy: {
      createdAt: "desc"
    }
  });

  return reports.map((report) =>
    mapLocalResultReport(
      report,
      {
        id: patient.id,
        fullName: patient.user.fullName,
        medicalRecordNumber: patient.medicalRecordNumber
      },
      includeAttachmentData
    )
  );
}

router.get(
  "/summary",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        center: true
      }
    });

    if (!patient) {
      throw new AppError("Patient profile not found.", 404);
    }

    const [appointments, referrals, subscriptions, notifications, doctors, threads, localReports] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId },
        include: appointmentInclude,
        orderBy: {
          scheduledAt: "asc"
        }
      }),
      prisma.referral.findMany({
        where: { patientId },
        include: referralInclude,
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.subscription.findMany({
        where: { patientId },
        include: subscriptionInclude,
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.notification.findMany({
        where: {
          userId: patient.userId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 6
      }),
      prisma.doctorProfile.findMany({
        where: {
          centerId: patient.centerId
        },
        include: {
          user: true,
          center: true,
          department: true
        },
        orderBy: {
          createdAt: "desc"
        }
      }),
      prisma.messageThread.findMany({
        where: {
          patientId
        },
        include: threadInclude,
        orderBy: {
          updatedAt: "desc"
        }
      }),
      getPatientLocalResultReports(patient, false)
    ]);

    const upcomingAppointments = appointments.filter(
      (appointment) =>
        appointment.scheduledAt >= new Date() &&
        appointment.status !== AppointmentStatus.CANCELLED
    );
    const completedReports = appointments.filter(
      (appointment) => appointment.status === AppointmentStatus.COMPLETED
    );
    const clinicalReports = [
      ...completedReports.map(mapAppointmentAsClinicalReport),
      ...localReports
    ].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime());
    const activeReferrals = referrals.filter((referral) => referral.status !== "COMPLETED");
    const activeSubscriptions = subscriptions.filter(
      (subscription) => subscription.status === SubscriptionStatus.ACTIVE
    );

    res.json({
      patient: mapPatient({
        ...patient,
        appointments,
        referrals
      }),
      stats: {
        upcomingAppointments: upcomingAppointments.length,
        completedReports: clinicalReports.length,
        activeReferrals: activeReferrals.length,
        unreadNotifications: notifications.filter((notification) => !notification.isRead).length,
        activeSubscriptions: activeSubscriptions.length,
        careTeamCount: doctors.length
      },
      nextAppointment: upcomingAppointments[0] ? mapAppointment(upcomingAppointments[0]) : null,
      recentReports: clinicalReports.slice(0, 3),
      careTeam: doctors.slice(0, 4).map(mapDoctor),
      recentThreads: threads.slice(0, 3).map((thread) => mapThread(thread)),
      recentNotifications: notifications,
      subscriptions: subscriptions.map(mapSubscription)
    });
  })
);

router.get(
  "/medical-record",
  authenticate,
  authorize(UserRole.PATIENT),
  asyncHandler(async (req, res) => {
    const patientId = requireProfileId(req.auth?.patientProfileId, "Patient profile is required.");

    const patient = await prisma.patientProfile.findUnique({
      where: { id: patientId },
      include: {
        user: true,
        center: true,
        appointments: {
          include: appointmentInclude,
          orderBy: {
            scheduledAt: "desc"
          }
        },
        referrals: {
          include: referralInclude,
          orderBy: {
            createdAt: "desc"
          }
        },
        subscriptions: {
          include: subscriptionInclude,
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!patient) {
      throw new AppError("Patient profile not found.", 404);
    }

    const localReports = await getPatientLocalResultReports(patient, true);
    const clinicalReports = [
      ...patient.appointments
        .filter((appointment) => appointment.status === AppointmentStatus.COMPLETED)
        .map(mapAppointmentAsClinicalReport),
      ...localReports
    ].sort((left, right) => new Date(right.scheduledAt).getTime() - new Date(left.scheduledAt).getTime());

    res.json({
      patient: mapPatient(patient),
      profile: {
        dateOfBirth: patient.dateOfBirth,
        gender: patient.gender,
        chronicConditions: patient.chronicConditions,
        insuranceNumber: patient.insuranceNumber,
        emergencyContact: patient.emergencyContact,
        center: {
          id: patient.center.id,
          code: patient.center.code,
          name: patient.center.name,
          city: patient.center.city,
          address: patient.center.address,
          phone: patient.center.phone
        }
      },
      clinicalReports,
      upcomingAppointments: patient.appointments
        .filter(
          (appointment) =>
            appointment.scheduledAt >= new Date() &&
            appointment.status !== AppointmentStatus.CANCELLED
        )
        .map(mapAppointment),
      referrals: patient.referrals.map(mapReferral),
      subscriptions: patient.subscriptions.map(mapSubscription)
    });
  })
);

router.use("/appointments", appointmentsRouter);
router.use("/centers", centersRouter);
router.use("/communications", communicationsRouter);
router.use("/doctors", doctorsRouter);
router.use("/notifications", notificationsRouter);
router.use("/patients", patientsRouter);
router.use("/referrals", referralsRouter);
router.use("/subscriptions", subscriptionsRouter);

export const portalRouter = router;

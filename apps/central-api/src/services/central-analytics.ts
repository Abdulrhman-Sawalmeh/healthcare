import { prisma } from "../lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

type CountMap = Record<string, number>;

export interface CentralAnalyticsFilters {
  startDate?: Date;
  endDate?: Date;
  centerId?: number;
  departmentId?: string;
  doctorId?: string;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function addDays(date: Date, amount: number) {
  return new Date(date.getTime() + amount * DAY_MS);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeDateRange(filters: CentralAnalyticsFilters) {
  const now = new Date();
  const endDate = filters.endDate ? endOfDay(filters.endDate) : endOfDay(now);
  const startDate = filters.startDate ? startOfDay(filters.startDate) : startOfDay(addDays(endDate, -29));

  return { startDate, endDate };
}

function buildDayBuckets(startDate: Date, endDate: Date) {
  const buckets: Array<{ date: string; count: number }> = [];
  let cursor = startOfDay(startDate);
  const last = startOfDay(endDate);

  while (cursor <= last) {
    buckets.push({ date: dayKey(cursor), count: 0 });
    cursor = addDays(cursor, 1);
  }

  return buckets;
}

function buildLastSevenDayBuckets(endDate: Date) {
  return buildDayBuckets(addDays(startOfDay(endDate), -6), endDate);
}

function buildLastMonthBuckets(endDate: Date, count = 6) {
  const buckets: Array<{ month: string; count: number }> = [];
  const cursor = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    buckets.push({ month: monthKey(date), count: 0 });
  }

  return buckets;
}

function increment(map: CountMap, key: string, amount = 1) {
  map[key] = (map[key] ?? 0) + amount;
}

function mapCounts(map: CountMap) {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((first, second) => second.count - first.count);
}

function average(values: number[]) {
  const available = values.filter((value) => Number.isFinite(value));

  if (available.length === 0) {
    return null;
  }

  return Math.round(available.reduce((sum, value) => sum + value, 0) / available.length);
}

function percentage(part: number, total: number) {
  if (total === 0) {
    return null;
  }

  return Math.round((part / total) * 1000) / 10;
}

function isFailedStatus(status: string) {
  return status === "FAILED" || status === "PERMANENT_FAILURE";
}

function isPendingStatus(status: string) {
  return status === "PENDING" || status === "PROCESSING" || status === "SYNCING";
}

function isSameCalendarDay(value: Date, day: Date) {
  return dayKey(value) === dayKey(day);
}

function topItems(map: CountMap, limit = 6) {
  return mapCounts(map).slice(0, limit);
}

export async function getCentralAnalyticsDashboard(filters: CentralAnalyticsFilters) {
  const { startDate, endDate } = normalizeDateRange(filters);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const selectedCenterId = filters.centerId;
  const selectedCenterWhere = selectedCenterId ? { centerId: selectedCenterId } : {};
  const selectedCentralReferralWhere = selectedCenterId
    ? {
        OR: [{ fromCenterId: selectedCenterId }, { toCenterId: selectedCenterId }]
      }
    : {};

  const centralCenters = await prisma.centralCenter.findMany({
    include: {
      loadSnapshots: true
    },
    orderBy: {
      centerName: "asc"
    }
  });
  const selectedCenters = selectedCenterId
    ? centralCenters.filter((center) => center.id === selectedCenterId)
    : centralCenters;
  const selectedCenterIds = selectedCenters.map((center) => center.id);
  const selectedCenterCodes = selectedCenters.map((center) => center.centerCode);

  const legacyCenters = await prisma.center.findMany({
    where: selectedCenterCodes.length > 0 ? { code: { in: selectedCenterCodes } } : undefined,
    include: {
      departments: true,
      doctors: {
        include: {
          user: {
            select: {
              fullName: true
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });
  const legacyCenterIdByCode = new Map(legacyCenters.map((center) => [center.code, center.id]));
  const selectedLegacyCenterIds = legacyCenters.map((center) => center.id);

  const appointmentWhere = {
    scheduledAt: {
      gte: startDate,
      lte: endDate
    },
    ...(selectedLegacyCenterIds.length > 0 ? { centerId: { in: selectedLegacyCenterIds } } : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.doctorId ? { doctorId: filters.doctorId } : {})
  };

  const localVisitWhere = {
    ...selectedCenterWhere,
    visitDate: {
      gte: startDate,
      lte: endDate
    },
    ...(filters.doctorId && Number.isFinite(Number(filters.doctorId))
      ? { doctorId: Number(filters.doctorId) }
      : {})
  };

  const referralWhere = {
    ...selectedCentralReferralWhere,
    requestedAt: {
      gte: startDate,
      lte: endDate
    }
  };

  const [
    totalUnifiedPatients,
    totalLocalPatients,
    totalVisits,
    todaysVisits,
    activeCenters,
    pendingReferrals,
    completedReferrals,
    localVisits,
    unifiedVisits,
    centralReferrals,
    appointments,
    labRequests,
    prescriptions,
    centerUsers,
    outgoingNotifications,
    incomingNotifications,
    centralNotifications,
    communicationLogs,
    processingLogs,
    alerts,
    localPatientCounts,
    localVisitCounts,
    labCounts,
    prescriptionVisits
  ] = await Promise.all([
    prisma.unifiedPatient.count(),
    prisma.localPatient.count({ where: selectedCenterWhere }),
    prisma.localVisit.count({ where: localVisitWhere }),
    prisma.localVisit.count({
      where: {
        ...selectedCenterWhere,
        visitDate: {
          gte: todayStart,
          lte: todayEnd
        }
      }
    }),
    prisma.centralCenter.count({ where: { isConnected: true } }),
    prisma.centralReferral.count({
      where: {
        ...selectedCentralReferralWhere,
        status: "PENDING"
      }
    }),
    prisma.centralReferral.count({
      where: {
        ...selectedCentralReferralWhere,
        status: "COMPLETED"
      }
    }),
    prisma.localVisit.findMany({
      where: localVisitWhere,
      include: {
        doctor: {
          select: {
            id: true,
            fullName: true,
            role: true
          }
        },
        prescriptions: true
      },
      orderBy: {
        visitDate: "desc"
      }
    }),
    prisma.unifiedVisit.findMany({
      where: {
        ...(selectedCenterId ? { centerId: selectedCenterId } : {}),
        visitDate: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        visitDate: "asc"
      }
    }),
    prisma.centralReferral.findMany({
      where: referralWhere,
      include: {
        fromCenter: {
          select: {
            id: true,
            centerCode: true,
            centerName: true
          }
        },
        toCenter: {
          select: {
            id: true,
            centerCode: true,
            centerName: true
          }
        }
      },
      orderBy: {
        requestedAt: "desc"
      }
    }),
    prisma.appointment.findMany({
      where: appointmentWhere,
      include: {
        doctor: {
          include: {
            user: {
              select: {
                fullName: true
              }
            }
          }
        },
        center: {
          select: {
            code: true,
            name: true
          }
        }
      },
      orderBy: {
        scheduledAt: "asc"
      }
    }),
    prisma.labRequestLocal.findMany({
      where: {
        ...selectedCenterWhere,
        requestDate: {
          gte: startDate,
          lte: endDate
        },
        ...(filters.doctorId && Number.isFinite(Number(filters.doctorId))
          ? { doctorId: Number(filters.doctorId) }
          : {})
      },
      include: {
        doctor: {
          select: {
            id: true,
            fullName: true
          }
        },
        test: {
          select: {
            testName: true,
            category: true
          }
        }
      },
      orderBy: {
        requestDate: "asc"
      }
    }),
    prisma.localPrescription.findMany({
      where: {
        issuedAt: {
          gte: startDate,
          lte: endDate
        },
        visit: {
          ...selectedCenterWhere,
          ...(filters.doctorId && Number.isFinite(Number(filters.doctorId))
            ? { doctorId: Number(filters.doctorId) }
            : {})
        }
      },
      include: {
        visit: {
          include: {
            doctor: {
              select: {
                id: true,
                fullName: true
              }
            }
          }
        }
      },
      orderBy: {
        issuedAt: "asc"
      }
    }),
    prisma.centerUserAccount.findMany({
      where: {
        ...(selectedCenterId ? { centerId: selectedCenterId } : {}),
        role: "DOCTOR"
      },
      orderBy: {
        fullName: "asc"
      }
    }),
    prisma.outgoingNotification.findMany({
      where: selectedCenterWhere,
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    prisma.incomingNotification.findMany({
      where: selectedCenterWhere,
      orderBy: {
        receivedAt: "desc"
      },
      take: 80
    }),
    prisma.centralNotification.findMany({
      where: selectedCenterId ? { targetCenterId: selectedCenterId } : {},
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    prisma.communicationLog.findMany({
      where: {
        ...(selectedCenterId ? { centerId: selectedCenterId } : {}),
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    prisma.notificationProcessingLog.findMany({
      where: {
        ...(selectedCenterId ? { centerId: selectedCenterId } : {}),
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        center: {
          select: {
            centerCode: true,
            centerName: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 80
    }),
    prisma.centerSystemAlert.findMany({
      where: selectedCenterId ? { centerId: selectedCenterId } : {},
      include: {
        center: {
          select: {
            centerCode: true,
            centerName: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    }),
    prisma.localPatient.groupBy({
      by: ["centerId"],
      where: selectedCenterWhere,
      _count: {
        _all: true
      }
    }),
    prisma.localVisit.groupBy({
      by: ["centerId"],
      where: localVisitWhere,
      _count: {
        _all: true
      }
    }),
    prisma.labRequestLocal.groupBy({
      by: ["centerId"],
      where: {
        ...selectedCenterWhere,
        requestDate: {
          gte: startDate,
          lte: endDate
        }
      },
      _count: {
        _all: true
      }
    }),
    prisma.localVisit.findMany({
      where: localVisitWhere,
      select: {
        id: true,
        centerId: true,
        doctorId: true,
        prescriptions: {
          select: {
            id: true,
            dispensed: true
          }
        }
      }
    })
  ]);

  const patientCountByCenter = new Map(localPatientCounts.map((item) => [item.centerId, item._count._all]));
  const visitCountByCenter = new Map(localVisitCounts.map((item) => [item.centerId, item._count._all]));
  const labCountByCenter = new Map(labCounts.map((item) => [item.centerId, item._count._all]));

  const failedSyncCount =
    outgoingNotifications.filter((item) => isFailedStatus(item.status)).length +
    incomingNotifications.filter((item) => isFailedStatus(item.status)).length +
    centralNotifications.filter((item) => isFailedStatus(item.status)).length +
    communicationLogs.filter((item) => isFailedStatus(item.status)).length;
  const pendingSyncCount =
    outgoingNotifications.filter((item) => isPendingStatus(item.status)).length +
    incomingNotifications.filter((item) => isPendingStatus(item.status)).length +
    centralNotifications.filter((item) => isPendingStatus(item.status)).length;

  const waitingSnapshots = selectedCenters
    .map((center) => center.loadSnapshots[0])
    .filter(Boolean) as Array<{ currentPatientLoad: number; averageWaitTime: number }>;
  const totalQueueLoad = waitingSnapshots.reduce((sum, snapshot) => sum + snapshot.currentPatientLoad, 0);
  const averageWaitingTime = average(waitingSnapshots.map((snapshot) => snapshot.averageWaitTime));
  const appointmentsToday = appointments.filter((appointment) => isSameCalendarDay(appointment.scheduledAt, now)).length;

  const visitDays = buildLastSevenDayBuckets(endDate);
  const visitDayMap = new Map(visitDays.map((bucket) => [bucket.date, bucket]));
  for (const visit of localVisits) {
    const key = dayKey(visit.visitDate);
    const bucket = visitDayMap.get(key);
    if (bucket) {
      bucket.count += 1;
    }
  }

  const visitMonths = buildLastMonthBuckets(endDate);
  const visitMonthMap = new Map(visitMonths.map((bucket) => [bucket.month, bucket]));
  for (const visit of localVisits) {
    const key = monthKey(visit.visitDate);
    const bucket = visitMonthMap.get(key);
    if (bucket) {
      bucket.count += 1;
    }
  }

  const visitTypes: CountMap = {};
  const visitReasons: CountMap = {};
  let completedVisits = 0;
  let incompleteVisits = 0;
  for (const visit of localVisits) {
    increment(visitTypes, visit.visitType);
    if (visit.diagnosis?.trim()) {
      increment(visitReasons, visit.diagnosis.trim());
    }
    if (visit.syncedToCentral || visit.syncState === "SYNCED") {
      completedVisits += 1;
    } else {
      incompleteVisits += 1;
    }
  }

  const referralStatuses: CountMap = {};
  const referralPriorities: CountMap = {};
  const referralReasons: CountMap = {};
  for (const referral of centralReferrals) {
    increment(referralStatuses, referral.status);
    increment(referralPriorities, referral.priority);
    if (referral.reason?.trim()) {
      increment(referralReasons, referral.reason.trim());
    }
  }

  const acceptedReferralCount = (referralStatuses.ACCEPTED ?? 0) + (referralStatuses.COMPLETED ?? 0);
  const rejectedReferralCount = referralStatuses.REJECTED ?? 0;
  const referralDecisionCount = acceptedReferralCount + rejectedReferralCount;
  const smallCenter = centralCenters.find((center) => center.centerCode === "C001");
  const mediumCenter = centralCenters.find((center) => center.centerCode === "M002");
  const smallToMediumReferrals =
    smallCenter && mediumCenter
      ? centralReferrals.filter(
          (referral) => referral.fromCenterId === smallCenter.id && referral.toCenterId === mediumCenter.id
        ).length
      : null;

  const appointmentStatuses: CountMap = {};
  const appointmentDays = buildDayBuckets(startDate, endDate);
  const appointmentDayMap = new Map(appointmentDays.map((bucket) => [bucket.date, bucket]));
  const appointmentsByDoctor: CountMap = {};
  for (const appointment of appointments) {
    increment(appointmentStatuses, appointment.status);
    const bucket = appointmentDayMap.get(dayKey(appointment.scheduledAt));
    if (bucket) {
      bucket.count += 1;
    }
    increment(appointmentsByDoctor, appointment.doctor.user.fullName);
  }

  const labStatuses: CountMap = {};
  const labTests: CountMap = {};
  const labDays = buildDayBuckets(startDate, endDate);
  const labDayMap = new Map(labDays.map((bucket) => [bucket.date, bucket]));
  const completedLabDurations: number[] = [];
  for (const request of labRequests) {
    increment(labStatuses, request.status);
    increment(labTests, request.test.testName);
    const bucket = labDayMap.get(dayKey(request.requestDate));
    if (bucket) {
      bucket.count += 1;
    }
    if (request.resultDate) {
      completedLabDurations.push(Math.round((request.resultDate.getTime() - request.requestDate.getTime()) / 60000));
    }
  }

  const prescriptionMedicines: CountMap = {};
  const prescriptionDays = buildDayBuckets(startDate, endDate);
  const prescriptionDayMap = new Map(prescriptionDays.map((bucket) => [bucket.date, bucket]));
  const prescriptionsByDoctor: CountMap = {};
  for (const prescription of prescriptions) {
    increment(prescriptionMedicines, prescription.medicineName);
    const bucket = prescriptionDayMap.get(dayKey(prescription.issuedAt));
    if (bucket) {
      bucket.count += 1;
    }
    if (prescription.visit.doctor?.fullName) {
      increment(prescriptionsByDoctor, prescription.visit.doctor.fullName);
    }
  }

  const staffWorkload = centerUsers.map((doctor) => {
    const doctorVisits = localVisits.filter((visit) => visit.doctorId === doctor.id);
    const doctorLabRequests = labRequests.filter((request) => request.doctorId === doctor.id);
    const doctorPrescriptionCount = prescriptionVisits
      .filter((visit) => visit.doctorId === doctor.id)
      .reduce((sum, visit) => sum + visit.prescriptions.length, 0);

    return {
      doctorId: doctor.id,
      doctorName: doctor.fullName,
      centerId: doctor.centerId,
      visits: doctorVisits.length,
      completedVisits: doctorVisits.filter((visit) => visit.syncedToCentral || visit.syncState === "SYNCED").length,
      labRequests: doctorLabRequests.length,
      prescriptions: doctorPrescriptionCount,
      appointments: null,
      referrals: null
    };
  });

  const centerComparison = selectedCenters.map((center) => {
    const loadSnapshot = center.loadSnapshots[0] ?? null;
    const centerVisits = localVisits.filter((visit) => visit.centerId === center.id);
    const completed = centerVisits.filter((visit) => visit.syncedToCentral || visit.syncState === "SYNCED").length;
    const centerReferrals = centralReferrals.filter(
      (referral) => referral.fromCenterId === center.id || referral.toCenterId === center.id
    );

    return {
      centerId: center.id,
      code: center.centerCode,
      name: center.centerName,
      type: center.centerType,
      isConnected: center.isConnected,
      lastSyncAt: center.lastSyncAt,
      patientCount: patientCountByCenter.get(center.id) ?? 0,
      visitCount: visitCountByCenter.get(center.id) ?? 0,
      referralsSent: centerReferrals.filter((referral) => referral.fromCenterId === center.id).length,
      referralsReceived: centerReferrals.filter((referral) => referral.toCenterId === center.id).length,
      averageWaitingTime: loadSnapshot?.averageWaitTime ?? null,
      queueLoad: loadSnapshot?.currentPatientLoad ?? null,
      completedVisits: completed,
      incompleteOrPendingVisits: centerVisits.length - completed,
      cancelledVisits: null,
      labRequests: labCountByCenter.get(center.id) ?? 0
    };
  });

  return {
    generatedAt: new Date(),
    filters: {
      startDate,
      endDate,
      centerId: filters.centerId ?? null,
      departmentId: filters.departmentId ?? null,
      doctorId: filters.doctorId ?? null,
      centers: centralCenters.map((center) => ({
        id: center.id,
        code: center.centerCode,
        name: center.centerName,
        type: center.centerType
      })),
      departments: legacyCenters.flatMap((center) =>
        center.departments.map((department) => ({
          id: department.id,
          name: department.name,
          centerCode: center.code,
          centerName: center.name
        }))
      ),
      doctors: [
        ...centerUsers.map((doctor) => ({
          id: String(doctor.id),
          name: doctor.fullName,
          centerId: doctor.centerId,
          source: "center_staff"
        })),
        ...legacyCenters.flatMap((center) =>
          center.doctors.map((doctor) => ({
            id: doctor.id,
            name: doctor.user.fullName,
            centerCode: center.code,
            source: "appointments"
          }))
        )
      ]
    },
    overview: {
      totalPatients: totalUnifiedPatients || totalLocalPatients,
      totalLocalPatientRecords: totalLocalPatients,
      totalVisits,
      todaysVisits,
      activeCenters,
      pendingReferrals,
      completedReferrals,
      failedSyncOperations: failedSyncCount,
      averageWaitingTime,
      patientsCurrentlyInQueue: totalQueueLoad,
      appointmentsToday
    },
    centerComparison,
    visits: {
      perDayLast7: visitDays,
      perMonth: visitMonths,
      byType: mapCounts(visitTypes),
      completedVsIncomplete: [
        { key: "COMPLETED_OR_SYNCED", count: completedVisits },
        { key: "INCOMPLETE_OR_PENDING_SYNC", count: incompleteVisits }
      ],
      mostCommonReasons: topItems(visitReasons),
      syncedVisits: unifiedVisits.length,
      localVsReferred: {
        available: false,
        message: "لا توجد علامة تربط الزيارة مباشرة بكونها زيارة محالة في البيانات الحالية."
      },
      averageVisitDuration: {
        available: false,
        message: "لا توجد حقول بداية ونهاية للزيارة لحساب متوسط مدة الزيارة."
      },
      cancelledVisits: {
        available: false,
        message: "نموذج الزيارات المحلي لا يحتوي حالة إلغاء صريحة في النظام المركزي."
      }
    },
    referrals: {
      total: centralReferrals.length,
      pending: referralStatuses.PENDING ?? 0,
      accepted: referralStatuses.ACCEPTED ?? 0,
      rejected: referralStatuses.REJECTED ?? 0,
      completed: referralStatuses.COMPLETED ?? 0,
      inProgress: referralStatuses.IN_PROGRESS ?? 0,
      cancelled: referralStatuses.CANCELLED ?? 0,
      acceptanceRate: percentage(acceptedReferralCount, referralDecisionCount),
      statusBreakdown: mapCounts(referralStatuses),
      priorityBreakdown: mapCounts(referralPriorities),
      mostCommonReasons: topItems(referralReasons),
      smallToMedium: smallToMediumReferrals,
      byDoctor: {
        available: false,
        message: "إحالات الشبكة المركزية لا تخزن الطبيب المرسل في النموذج الحالي."
      }
    },
    appointments: {
      total: appointments.length,
      scheduled: appointmentStatuses.SCHEDULED ?? 0,
      confirmed: appointmentStatuses.CONFIRMED ?? 0,
      completed: appointmentStatuses.COMPLETED ?? 0,
      cancelled: appointmentStatuses.CANCELLED ?? 0,
      noShow: appointmentStatuses.NO_SHOW ?? 0,
      statusBreakdown: mapCounts(appointmentStatuses),
      byDate: appointmentDays,
      byDoctor: topItems(appointmentsByDoctor)
    },
    queue: {
      currentWaiting: totalQueueLoad,
      averageWaitingTime,
      longestWaitingPatient: {
        available: false,
        message: "لا توجد بيانات انتظار على مستوى المريض في النظام المركزي."
      },
      bottleneckStage: {
        available: false,
        message: "لا توجد بيانات مراحل workflow مركزية لحساب عنق الزجاجة."
      },
      patientsByStage: {
        available: false,
        message: "لا توجد بيانات مراحل queue كافية لحساب توزيع المرضى حسب المرحلة حاليًا."
      },
      completedVisitsToday: localVisits.filter(
        (visit) => isSameCalendarDay(visit.visitDate, now) && (visit.syncedToCentral || visit.syncState === "SYNCED")
      ).length,
      averageTimeByStage: {
        available: false,
        message: "لا توجد طوابع زمنية لكل مرحلة لحساب متوسط الوقت داخل المرحلة."
      }
    },
    lab: {
      total: labRequests.length,
      pending: labStatuses.PENDING ?? 0,
      inProgress: labStatuses.IN_PROGRESS ?? 0,
      completed: labStatuses.COMPLETED ?? 0,
      cancelled: labStatuses.CANCELLED ?? 0,
      mostRequestedTests: topItems(labTests),
      averageCompletionMinutes: average(completedLabDurations),
      workloadByDay: labDays
    },
    pharmacy: {
      totalPrescriptions: prescriptions.length,
      pendingPrescriptions: prescriptions.filter((prescription) => !prescription.dispensed).length,
      dispensedPrescriptions: prescriptions.filter((prescription) => prescription.dispensed).length,
      mostPrescribedMedicines: topItems(prescriptionMedicines),
      workloadByDay: prescriptionDays,
      prescriptionsByDoctor: topItems(prescriptionsByDoctor)
    },
    staffWorkload,
    systemHealth: {
      centers: selectedCenters.map((center) => ({
        centerId: center.id,
        code: center.centerCode,
        name: center.centerName,
        isConnected: center.isConnected,
        lastSyncAt: center.lastSyncAt,
        failedSyncCount:
          outgoingNotifications.filter((item) => item.centerId === center.id && isFailedStatus(item.status)).length +
          incomingNotifications.filter((item) => item.centerId === center.id && isFailedStatus(item.status)).length +
          centralNotifications.filter((item) => item.targetCenterId === center.id && isFailedStatus(item.status)).length,
        pendingSyncCount:
          outgoingNotifications.filter((item) => item.centerId === center.id && isPendingStatus(item.status)).length +
          incomingNotifications.filter((item) => item.centerId === center.id && isPendingStatus(item.status)).length +
          centralNotifications.filter((item) => item.targetCenterId === center.id && isPendingStatus(item.status)).length,
        queueLoad: center.loadSnapshots[0]?.currentPatientLoad ?? null,
        averageWaitingTime: center.loadSnapshots[0]?.averageWaitTime ?? null,
        legacyCenterId: legacyCenterIdByCode.get(center.centerCode) ?? null
      })),
      failedSyncCount,
      pendingSyncCount,
      recentErrors: [
        ...processingLogs
          .filter((log) => log.severity === "ERROR")
          .map((log) => ({
            id: `processing-${log.id}`,
            centerName: log.center.centerName,
            centerCode: log.center.centerCode,
            message: log.message,
            createdAt: log.createdAt,
            severity: log.severity
          })),
        ...communicationLogs
          .filter((log) => log.errorMessage)
          .map((log) => ({
            id: `communication-${log.id}`,
            centerName: selectedCenters.find((center) => center.id === log.centerId)?.centerName ?? "غير محدد",
            centerCode: selectedCenters.find((center) => center.id === log.centerId)?.centerCode ?? "-",
            message: log.errorMessage ?? "خطأ اتصال",
            createdAt: log.createdAt,
            severity: "ERROR"
          }))
      ].slice(0, 10),
      recentAlerts: alerts.map((alert) => ({
        id: alert.id,
        centerName: alert.center.centerName,
        centerCode: alert.center.centerCode,
        title: alert.title,
        message: alert.message,
        severity: alert.severity,
        isResolved: alert.isResolved,
        createdAt: alert.createdAt
      }))
    },
    limitations: [
      "لا توجد بيانات مراحل queue التفصيلية في central schema الحالي.",
      "لا توجد حقول بداية/نهاية للزيارة لحساب متوسط مدة الزيارة.",
      "لا توجد علامة مباشرة تميز الزيارة المحلية عن زيارة ناتجة عن إحالة.",
      "إحالات الشبكة المركزية لا تخزن الطبيب المرسل، لذلك تحليلات الإحالات حسب الطبيب غير متاحة من هذا المصدر."
    ]
  };
}

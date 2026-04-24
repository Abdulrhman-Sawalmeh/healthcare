import { ReferralStatus } from "@prisma/client";
import { addDays, startOfDay, subDays } from "date-fns";

import { prisma } from "../lib/prisma";

export async function getDashboardSummary(centerId: string) {
  const today = startOfDay(new Date());
  const lookback = subDays(new Date(), 30);
  const pendingReferralStatuses: ReferralStatus[] = [
    ReferralStatus.PENDING,
    ReferralStatus.ACCEPTED,
    ReferralStatus.IN_PROGRESS
  ];

  const [
    center,
    activePatients,
    todayAppointments,
    recentAppointments,
    referrals,
    departments,
    kpiSnapshots
  ] = await Promise.all([
    prisma.center.findUnique({
      where: { id: centerId },
      include: {
        departments: true,
        doctors: true
      }
    }),
    prisma.patientProfile.count({
      where: { centerId }
    }),
    prisma.appointment.count({
      where: {
        centerId,
        scheduledAt: {
          gte: today,
          lt: addDays(today, 1)
        }
      }
    }),
    prisma.appointment.findMany({
      where: {
        centerId,
        scheduledAt: {
          gte: lookback
        }
      }
    }),
    prisma.referral.findMany({
      where: {
        OR: [{ fromCenterId: centerId }, { toCenterId: centerId }]
      }
    }),
    prisma.department.findMany({
      where: { centerId },
      include: {
        doctors: true,
        appointments: {
          where: {
            scheduledAt: {
              gte: lookback
            }
          }
        }
      }
    }),
    prisma.kpiSnapshot.findMany({
      where: { centerId },
      orderBy: {
        capturedAt: "asc"
      },
      take: 6
    })
  ]);

  const completedAppointments = recentAppointments.filter(
    (appointment) => appointment.status === "COMPLETED"
  );
  const trackedAppointments = recentAppointments.filter((appointment) =>
    ["COMPLETED", "NO_SHOW"].includes(appointment.status)
  );

  const averageWaitMinutes =
    completedAppointments.length > 0
      ? Math.round(
          completedAppointments.reduce(
            (sum, appointment) => sum + (appointment.waitingMinutes ?? 0),
            0
          ) / completedAppointments.length
        )
      : 0;

  const adherenceRate =
    trackedAppointments.length > 0
      ? Math.round(
          (trackedAppointments.filter((appointment) => appointment.attended).length /
            trackedAppointments.length) *
            100
        )
      : 0;

  const pendingReferrals = referrals.filter((referral) =>
    pendingReferralStatuses.includes(referral.status)
  ).length;

  const completedReferrals = referrals.filter(
    (referral) => referral.status === "COMPLETED"
  ).length;

  const referralRate =
    referrals.length > 0 ? Math.round((completedReferrals / referrals.length) * 100) : 0;

  const departmentWorkload = departments.map((department) => {
    const appointmentCount = department.appointments.length;
    const doctorCount = department.doctors.length || 1;
    const score = Math.round((appointmentCount / doctorCount) * 10);

    return {
      departmentId: department.id,
      name: department.name,
      doctors: department.doctors.length,
      appointments: appointmentCount,
      workloadScore: score
    };
  });

  return {
    center: center
      ? {
          id: center.id,
          name: center.name,
          city: center.city,
          departments: center.departments.length,
          doctors: center.doctors.length
        }
      : null,
    metrics: {
      activePatients,
      todayAppointments,
      pendingReferrals,
      averageWaitMinutes,
      adherenceRate,
      referralRate
    },
    departmentWorkload,
    referralBreakdown: {
      pending: referrals.filter((referral) => referral.status === "PENDING").length,
      accepted: referrals.filter((referral) => referral.status === "ACCEPTED").length,
      inProgress: referrals.filter((referral) => referral.status === "IN_PROGRESS").length,
      completed: completedReferrals,
      rejected: referrals.filter((referral) => referral.status === "REJECTED").length
    },
    kpiTrend: kpiSnapshots.map((snapshot) => ({
      id: snapshot.id,
      capturedAt: snapshot.capturedAt,
      averageWaitingMinutes: snapshot.averageWaitingMinutes,
      referralRate: Math.round(snapshot.referralRate * 100),
      workloadScore: Math.round(snapshot.workloadScore),
      adherenceRate: Math.round(snapshot.adherenceRate * 100)
    }))
  };
}

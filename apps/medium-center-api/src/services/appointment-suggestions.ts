import { AppointmentStatus, AppointmentType } from "@prisma/client";
import { addDays, addMinutes, compareAsc, endOfDay, max, startOfDay } from "date-fns";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

const SLOT_MINUTES = 30;
const WORKDAY_START_HOUR = 9;
const WORKDAY_END_HOUR = 17;
const MAX_SEARCH_DAYS = 14;
const DEFAULT_SUGGESTION_LIMIT = 5;

export const appointmentPriorityValues = ["NORMAL", "URGENT", "EMERGENCY"] as const;

export type AppointmentSuggestionPriority = (typeof appointmentPriorityValues)[number];

type DoctorSummary = {
  id: string;
  fullName: string;
  specialization: string;
  department: {
    id: string;
    name: string;
  };
};

type SuggestionInput = {
  centerId: string;
  doctorId: string;
  preferredDate: Date;
  appointmentType: AppointmentType;
  priority: AppointmentSuggestionPriority;
  patientId?: string;
  limit?: number;
};

type ConflictInput = {
  centerId: string;
  doctorId: string;
  scheduledAt: Date;
};

export type AppointmentSuggestion = {
  scheduledAt: Date;
  type: AppointmentType;
  priority: AppointmentSuggestionPriority;
  note: string;
  doctor: DoctorSummary;
};

function roundUpToSlot(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);

  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;

  if (roundedMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
    return rounded;
  }

  rounded.setMinutes(roundedMinutes, 0, 0);
  return rounded;
}

function buildDaySlot(day: Date, hour: number, minute: number) {
  const slot = new Date(day);
  slot.setHours(hour, minute, 0, 0);
  return slot;
}

function overlapsBlockedSlot(slotStart: Date, blockedStart: Date) {
  const slotEnd = addMinutes(slotStart, SLOT_MINUTES);
  const blockedEnd = addMinutes(blockedStart, SLOT_MINUTES);

  return slotStart < blockedEnd && blockedStart < slotEnd;
}

function buildSuggestionNote(input: {
  appointmentType: AppointmentType;
  priority: AppointmentSuggestionPriority;
  followUpWithSameDoctor: boolean;
  preferredDate: Date;
  suggestedDate: Date;
}) {
  if (input.priority === "EMERGENCY") {
    return "Earliest available slot for urgent booking.";
  }

  if (input.appointmentType === AppointmentType.FOLLOW_UP && input.followUpWithSameDoctor) {
    return "Suggested with the same doctor from your previous follow-up.";
  }

  if (input.suggestedDate < input.preferredDate) {
    return "Closest available slot before the requested time.";
  }

  if (input.suggestedDate > input.preferredDate) {
    return "Closest available slot after the requested time.";
  }

  return "Closest available slot for the selected doctor.";
}

async function loadDoctorSummary(centerId: string, doctorId: string) {
  const doctor = await prisma.doctorProfile.findUnique({
    where: { id: doctorId },
    include: {
      user: true,
      department: true
    }
  });

  if (!doctor || doctor.centerId !== centerId) {
    throw new AppError("Selected doctor does not belong to the active center.", 400);
  }

  return {
    id: doctor.id,
    fullName: doctor.user.fullName,
    specialization: doctor.specialization,
    department: {
      id: doctor.department.id,
      name: doctor.department.name
    }
  } satisfies DoctorSummary;
}

export async function findAppointmentConflict(input: ConflictInput) {
  return prisma.appointment.findFirst({
    where: {
      centerId: input.centerId,
      doctorId: input.doctorId,
      status: {
        not: AppointmentStatus.CANCELLED
      },
      scheduledAt: {
        gt: addMinutes(input.scheduledAt, -SLOT_MINUTES),
        lt: addMinutes(input.scheduledAt, SLOT_MINUTES)
      }
    },
    select: {
      id: true,
      scheduledAt: true
    }
  });
}

export async function getAppointmentSuggestions(input: SuggestionInput): Promise<AppointmentSuggestion[]> {
  const now = roundUpToSlot(new Date());
  const preferredAnchor = roundUpToSlot(
    input.priority === "EMERGENCY" ? now : max([input.preferredDate, now])
  );
  const searchBaseDay = startOfDay(preferredAnchor);
  const searchEnd = endOfDay(addDays(searchBaseDay, MAX_SEARCH_DAYS));

  const [doctor, blockedAppointments, latestPatientAppointment] = await Promise.all([
    loadDoctorSummary(input.centerId, input.doctorId),
    prisma.appointment.findMany({
      where: {
        centerId: input.centerId,
        doctorId: input.doctorId,
        status: {
          not: AppointmentStatus.CANCELLED
        },
        scheduledAt: {
          gte: searchBaseDay,
          lte: searchEnd
        }
      },
      select: {
        scheduledAt: true
      }
    }),
    input.patientId
      ? prisma.appointment.findFirst({
          where: {
            patientId: input.patientId,
            status: {
              not: AppointmentStatus.CANCELLED
            }
          },
          orderBy: {
            scheduledAt: "desc"
          },
          select: {
            doctorId: true
          }
        })
      : Promise.resolve(null)
  ]);

  const followUpWithSameDoctor =
    input.appointmentType === AppointmentType.FOLLOW_UP &&
    latestPatientAppointment?.doctorId === input.doctorId;

  const candidateSlots: Date[] = [];

  for (let dayOffset = 0; dayOffset <= MAX_SEARCH_DAYS; dayOffset += 1) {
    const day = addDays(searchBaseDay, dayOffset);

    for (let hour = WORKDAY_START_HOUR; hour < WORKDAY_END_HOUR; hour += 1) {
      for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
        const slot = buildDaySlot(day, hour, minute);
        const slotEndsAt = addMinutes(slot, SLOT_MINUTES);

        if (slotEndsAt > buildDaySlot(day, WORKDAY_END_HOUR, 0) && minute > 0) {
          continue;
        }

        if (slot < now) {
          continue;
        }

        if (blockedAppointments.some((blocked) => overlapsBlockedSlot(slot, blocked.scheduledAt))) {
          continue;
        }

        candidateSlots.push(slot);
      }
    }
  }

  const sortedSlots = [...candidateSlots].sort((left, right) => {
    if (input.priority === "EMERGENCY") {
      return compareAsc(left, right);
    }

    const leftDistance = Math.abs(left.getTime() - input.preferredDate.getTime());
    const rightDistance = Math.abs(right.getTime() - input.preferredDate.getTime());

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return compareAsc(left, right);
  });

  return sortedSlots.slice(0, input.limit ?? DEFAULT_SUGGESTION_LIMIT).map((slot) => ({
    scheduledAt: slot,
    type: input.appointmentType,
    priority: input.priority,
    note: buildSuggestionNote({
      appointmentType: input.appointmentType,
      priority: input.priority,
      followUpWithSameDoctor,
      preferredDate: input.preferredDate,
      suggestedDate: slot
    }),
    doctor
  }));
}

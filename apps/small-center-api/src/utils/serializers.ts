import {
  Appointment,
  Center,
  Department,
  DoctorProfile,
  Message,
  MessageThread,
  Notification,
  PatientProfile,
  Payment,
  Prisma,
  Subscription,
  SubscriptionPlan,
  User
} from "@prisma/client";

type SessionUser = User & {
  patientProfile: (PatientProfile & { center: Center }) | null;
  doctorProfile: (DoctorProfile & { center: Center; department: Department }) | null;
  adminMemberships: Array<{ center: Center }>;
};

type AppointmentPayload = Appointment & {
  center: Center;
  department: Department;
  patient: PatientProfile & { user: User };
  doctor: DoctorProfile & { user: User; department: Department };
};

type ReferralPayload = Prisma.ReferralGetPayload<{
  include: {
    fromCenter: true;
    toCenter: true;
    patient: { include: { user: true } };
    fromDoctor: { include: { user: true } };
    toDoctor: { include: { user: true } };
    department: true;
  };
}>;

type ThreadPayload = MessageThread & {
  patient: PatientProfile & { user: User; center?: Center };
  doctor: DoctorProfile & { user: User; department: Department };
  messages: Array<Message & { sender: User }>;
};

type PatientIdentity = {
  nationalId?: string | null;
  unifiedId?: string | null;
};

type SubscriptionPayload = Subscription & {
  center: Center;
  plan: SubscriptionPlan;
  patient: PatientProfile & { user: User };
  payments: Payment[];
};

type PatientPayload = PatientProfile & {
  user: User;
  center: Center;
  appointments: Appointment[];
  referrals: Prisma.ReferralGetPayload<{}>[];
};

type DoctorPayload = DoctorProfile & {
  user: User;
  center: Center;
  department: Department;
};

export function mapSessionUser(user: SessionUser) {
  const patientCenter = user.patientProfile?.center;
  const doctorCenter = user.doctorProfile?.center;
  const adminCenter = user.adminMemberships[0]?.center;
  const center = patientCenter ?? doctorCenter ?? adminCenter;

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phone: user.phone,
    centerId: center?.id,
    centerName: center?.name,
    patientProfileId: user.patientProfile?.id,
    doctorProfileId: user.doctorProfile?.id,
    departmentName: user.doctorProfile?.department.name,
    memberships: user.adminMemberships.map((membership) => ({
      centerId: membership.center.id,
      centerName: membership.center.name
    }))
  };
}

export function mapAppointment(appointment: AppointmentPayload) {
  return {
    id: appointment.id,
    status: appointment.status,
    type: appointment.type,
    scheduledAt: appointment.scheduledAt,
    reason: appointment.reason,
    notes: appointment.notes,
    waitingMinutes: appointment.waitingMinutes,
    attended: appointment.attended,
    center: {
      id: appointment.center.id,
      name: appointment.center.name
    },
    department: {
      id: appointment.department.id,
      name: appointment.department.name
    },
    patient: {
      id: appointment.patient.id,
      fullName: appointment.patient.user.fullName,
      medicalRecordNumber: appointment.patient.medicalRecordNumber
    },
    doctor: {
      id: appointment.doctor.id,
      fullName: appointment.doctor.user.fullName,
      specialization: appointment.doctor.specialization
    }
  };
}

export function mapReferral(referral: ReferralPayload) {
  return {
    id: referral.id,
    status: referral.status,
    reason: referral.reason,
    notes: referral.notes,
    priority: referral.priority,
    createdAt: referral.createdAt,
    acceptedAt: referral.acceptedAt,
    completedAt: referral.completedAt,
    fromCenter: {
      id: referral.fromCenter.id,
      name: referral.fromCenter.name
    },
    toCenter: {
      id: referral.toCenter.id,
      name: referral.toCenter.name
    },
    patient: {
      id: referral.patient.id,
      fullName: referral.patient.user.fullName,
      medicalRecordNumber: referral.patient.medicalRecordNumber
    },
    fromDoctor: {
      id: referral.fromDoctor.id,
      fullName: referral.fromDoctor.user.fullName
    },
    toDoctor: referral.toDoctor
      ? {
          id: referral.toDoctor.id,
          fullName: referral.toDoctor.user.fullName
        }
      : null,
    department: referral.department
      ? {
          id: referral.department.id,
          name: referral.department.name
        }
      : null
  };
}

export function mapThread(thread: ThreadPayload, patientIdentity: PatientIdentity = {}) {
  return {
    id: thread.id,
    updatedAt: thread.updatedAt,
    patient: {
      id: thread.patient.id,
      fullName: thread.patient.user.fullName,
      medicalRecordNumber: thread.patient.medicalRecordNumber,
      nationalId: patientIdentity.nationalId ?? null,
      unifiedId: patientIdentity.unifiedId ?? null
    },
    doctor: {
      id: thread.doctor.id,
      fullName: thread.doctor.user.fullName,
      departmentName: thread.doctor.department.name
    },
    messages: thread.messages.map((message) => ({
      id: message.id,
      content: message.content,
      createdAt: message.createdAt,
      isRead: message.isRead,
      attachment: message.attachmentFileName && message.attachmentMimeType && message.attachmentBase64
        ? {
            fileName: message.attachmentFileName,
            mimeType: message.attachmentMimeType,
            contentBase64: message.attachmentBase64,
            sizeBytes: message.attachmentSizeBytes ?? 0
          }
        : null,
      sender: {
        id: message.sender.id,
        fullName: message.sender.fullName,
        role: message.sender.role
      }
    }))
  };
}

export function mapNotification(notification: Notification) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    isRead: notification.isRead,
    createdAt: notification.createdAt
  };
}

export function mapSubscription(subscription: SubscriptionPayload) {
  return {
    id: subscription.id,
    status: subscription.status,
    autoRenew: subscription.autoRenew,
    startedAt: subscription.startedAt,
    endsAt: subscription.endsAt,
    center: {
      id: subscription.center.id,
      name: subscription.center.name
    },
    patient: {
      id: subscription.patient.id,
      fullName: subscription.patient.user.fullName
    },
    plan: {
      id: subscription.plan.id,
      name: subscription.plan.name,
      billingCycle: subscription.plan.billingCycle,
      priceInCents: subscription.plan.priceInCents,
      maxVisits: subscription.plan.maxVisits,
      description: subscription.plan.description
    },
    payments: subscription.payments.map((payment) => ({
      id: payment.id,
      amountInCents: payment.amountInCents,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt
    }))
  };
}

export function mapPatient(patient: PatientPayload) {
  return {
    id: patient.id,
    fullName: patient.user.fullName,
    email: patient.user.email,
    phone: patient.user.phone,
    medicalRecordNumber: patient.medicalRecordNumber,
    chronicConditions: patient.chronicConditions,
    insuranceNumber: patient.insuranceNumber,
    center: {
      id: patient.center.id,
      name: patient.center.name
    },
    appointmentsCount: patient.appointments.length,
    referralsCount: patient.referrals.length
  };
}

export function mapDoctor(doctor: DoctorPayload) {
  return {
    id: doctor.id,
    fullName: doctor.user.fullName,
    email: doctor.user.email,
    phone: doctor.user.phone,
    specialization: doctor.specialization,
    yearsExperience: doctor.yearsExperience,
    center: {
      id: doctor.center.id,
      name: doctor.center.name
    },
    department: {
      id: doctor.department.id,
      name: doctor.department.name
    }
  };
}

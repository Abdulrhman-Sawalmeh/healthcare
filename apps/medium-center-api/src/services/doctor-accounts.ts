import bcrypt from "bcryptjs";
import { CenterUserRole, Gender, Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

interface BaseCenterDoctorInput {
  centerId: number;
  username: string;
  fullName: string;
  phone: string;
  email?: string;
  nationalId: string;
  gender: Gender;
  specialization: string;
  yearsExperience: number;
  licenseNumber: string;
  qualification?: string;
  shiftDays: string[];
  shiftStartTime?: string;
  shiftEndTime?: string;
  consultationRoom?: string;
  hireDate?: Date;
  bio?: string;
  notes?: string;
  isActive: boolean;
}

interface CreateCenterDoctorInput extends BaseCenterDoctorInput {
  createdById: number;
  password: string;
}

interface UpdateCenterDoctorInput extends BaseCenterDoctorInput {
  doctorId: number;
  password?: string;
}

type DoctorWithRelations = Prisma.CenterUserAccountGetPayload<{
  include: {
    createdBy: {
      select: {
        fullName: true;
      };
    };
    doctorProfile: true;
  };
}>;

function sortArabic(values: Iterable<string>) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "ar"));
}

function mapUniqueConstraintError(error: Prisma.PrismaClientKnownRequestError) {
  const target = Array.isArray(error.meta?.target)
    ? error.meta.target.join(",")
    : String(error.meta?.target ?? "");

  if (target.includes("username")) {
    return "اسم المستخدم مستخدم بالفعل، اختر اسمًا آخر.";
  }

  if (target.includes("email")) {
    return "البريد الإلكتروني مستخدم بالفعل لطبيب أو حساب آخر.";
  }

  if (target.includes("nationalId")) {
    return "رقم الهوية مسجل مسبقًا لطبيب آخر.";
  }

  if (target.includes("licenseNumber")) {
    return "رقم الترخيص الطبي مسجل مسبقًا.";
  }

  return "تعذر حفظ بيانات الطبيب بسبب تعارض في البيانات الفريدة.";
}

function mapDoctorRecord(doctor: DoctorWithRelations) {
  return {
    id: doctor.id,
    username: doctor.username,
    fullName: doctor.fullName,
    role: doctor.role,
    phone: doctor.phone,
    email: doctor.email,
    isActive: doctor.isActive,
    createdAt: doctor.createdAt,
    createdByName: doctor.createdBy?.fullName ?? null,
    profile: doctor.doctorProfile
      ? {
          nationalId: doctor.doctorProfile.nationalId,
          gender: doctor.doctorProfile.gender,
          specialization: doctor.doctorProfile.specialization,
          yearsExperience: doctor.doctorProfile.yearsExperience,
          licenseNumber: doctor.doctorProfile.licenseNumber,
          qualification: doctor.doctorProfile.qualification,
          shiftDays: doctor.doctorProfile.shiftDays,
          shiftStartTime: doctor.doctorProfile.shiftStartTime,
          shiftEndTime: doctor.doctorProfile.shiftEndTime,
          consultationRoom: doctor.doctorProfile.consultationRoom,
          hireDate: doctor.doctorProfile.hireDate,
          bio: doctor.doctorProfile.bio,
          notes: doctor.doctorProfile.notes
        }
      : null
  };
}

async function syncCenterSpecialties(
  tx: Prisma.TransactionClient,
  centerId: number,
  specialization: string
) {
  const center = await tx.centralCenter.findUnique({
    where: { id: centerId },
    select: {
      specialties: true
    }
  });

  if (!center) {
    throw new AppError("تعذر العثور على المركز المطلوب.", 404);
  }

  if (center.specialties.includes(specialization)) {
    return center.specialties;
  }

  const specialties = sortArabic([...center.specialties, specialization]);

  await tx.centralCenter.update({
    where: { id: centerId },
    data: {
      specialties
    }
  });

  return specialties;
}

async function syncCenterDoctorAvailability(tx: Prisma.TransactionClient, centerId: number) {
  const doctorProfiles = await tx.centerDoctorProfile.findMany({
    where: {
      centerId,
      userAccount: {
        is: {
          role: CenterUserRole.DOCTOR,
          isActive: true
        }
      }
    },
    select: {
      specialization: true
    }
  });

  if (doctorProfiles.length === 0) {
    await tx.centerDoctorAvailability.deleteMany({
      where: { centerId }
    });
    return;
  }

  const counts = doctorProfiles.reduce<Map<string, number>>((accumulator, profile) => {
    accumulator.set(profile.specialization, (accumulator.get(profile.specialization) ?? 0) + 1);
    return accumulator;
  }, new Map<string, number>());

  const specialties = [...counts.keys()];

  await tx.centerDoctorAvailability.deleteMany({
    where: {
      centerId,
      specialty: {
        notIn: specialties
      }
    }
  });

  await Promise.all(
    specialties.map((specialty) =>
      tx.centerDoctorAvailability.upsert({
        where: {
          centerId_specialty: {
            centerId,
            specialty
          }
        },
        create: {
          centerId,
          specialty,
          availableDoctors: counts.get(specialty) ?? 0,
          totalDoctors: counts.get(specialty) ?? 0
        },
        update: {
          availableDoctors: counts.get(specialty) ?? 0,
          totalDoctors: counts.get(specialty) ?? 0,
          lastUpdate: new Date()
        }
      })
    )
  );
}

export async function getCenterDoctorsBundle(centerId: number) {
  const [center, doctors, masterSpecialties] = await Promise.all([
    prisma.centralCenter.findUnique({
      where: { id: centerId },
      select: {
        id: true,
        centerCode: true,
        centerName: true,
        specialties: true
      }
    }),
    prisma.centerUserAccount.findMany({
      where: {
        centerId,
        role: CenterUserRole.DOCTOR
      },
      include: {
        createdBy: {
          select: {
            fullName: true
          }
        },
        doctorProfile: true
      },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }]
    }),
    prisma.masterSpecialty.findMany({
      select: {
        specialtyName: true
      },
      orderBy: {
        specialtyName: "asc"
      }
    })
  ]);

  if (!center) {
    throw new AppError("تعذر العثور على المركز المطلوب.", 404);
  }

  return {
    center: {
      id: center.id,
      code: center.centerCode,
      name: center.centerName,
      specialties: center.specialties
    },
    specialtyOptions: sortArabic([
      ...center.specialties,
      ...masterSpecialties.map((item) => item.specialtyName)
    ]),
    doctors: doctors.map(mapDoctorRecord)
  };
}

export async function createCenterDoctor(input: CreateCenterDoctorInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const passwordHash = await bcrypt.hash(input.password, 10);

      await syncCenterSpecialties(tx, input.centerId, input.specialization);

      const doctor = await tx.centerUserAccount.create({
        data: {
          centerId: input.centerId,
          username: input.username,
          passwordHash,
          fullName: input.fullName,
          role: CenterUserRole.DOCTOR,
          phone: input.phone,
          email: input.email,
          isActive: input.isActive,
          createdById: input.createdById,
          doctorProfile: {
            create: {
              centerId: input.centerId,
              nationalId: input.nationalId,
              gender: input.gender,
              specialization: input.specialization,
              yearsExperience: input.yearsExperience,
              licenseNumber: input.licenseNumber,
              qualification: input.qualification,
              shiftDays: input.shiftDays,
              shiftStartTime: input.shiftStartTime,
              shiftEndTime: input.shiftEndTime,
              consultationRoom: input.consultationRoom,
              hireDate: input.hireDate,
              bio: input.bio,
              notes: input.notes
            }
          }
        },
        include: {
          createdBy: {
            select: {
              fullName: true
            }
          },
          doctorProfile: true
        }
      });

      await syncCenterDoctorAvailability(tx, input.centerId);

      return {
        success: true,
        credentials: {
          username: input.username,
          temporaryPassword: input.password
        },
        doctor: mapDoctorRecord(doctor)
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(mapUniqueConstraintError(error), 409);
    }

    throw error;
  }
}

export async function updateCenterDoctor(input: UpdateCenterDoctorInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existingDoctor = await tx.centerUserAccount.findFirst({
        where: {
          id: input.doctorId,
          centerId: input.centerId,
          role: CenterUserRole.DOCTOR
        },
        include: {
          createdBy: {
            select: {
              fullName: true
            }
          },
          doctorProfile: true
        }
      });

      if (!existingDoctor) {
        throw new AppError("تعذر العثور على الطبيب المطلوب.", 404);
      }

      await syncCenterSpecialties(tx, input.centerId, input.specialization);

      const passwordHash = input.password ? await bcrypt.hash(input.password, 10) : undefined;

      const doctor = await tx.centerUserAccount.update({
        where: {
          id: existingDoctor.id
        },
        data: {
          username: input.username,
          passwordHash,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          isActive: input.isActive,
          doctorProfile: {
            upsert: {
              create: {
                centerId: input.centerId,
                nationalId: input.nationalId,
                gender: input.gender,
                specialization: input.specialization,
                yearsExperience: input.yearsExperience,
                licenseNumber: input.licenseNumber,
                qualification: input.qualification,
                shiftDays: input.shiftDays,
                shiftStartTime: input.shiftStartTime,
                shiftEndTime: input.shiftEndTime,
                consultationRoom: input.consultationRoom,
                hireDate: input.hireDate,
                bio: input.bio,
                notes: input.notes
              },
              update: {
                nationalId: input.nationalId,
                gender: input.gender,
                specialization: input.specialization,
                yearsExperience: input.yearsExperience,
                licenseNumber: input.licenseNumber,
                qualification: input.qualification,
                shiftDays: input.shiftDays,
                shiftStartTime: input.shiftStartTime,
                shiftEndTime: input.shiftEndTime,
                consultationRoom: input.consultationRoom,
                hireDate: input.hireDate,
                bio: input.bio,
                notes: input.notes
              }
            }
          }
        },
        include: {
          createdBy: {
            select: {
              fullName: true
            }
          },
          doctorProfile: true
        }
      });

      await syncCenterDoctorAvailability(tx, input.centerId);

      return {
        success: true,
        doctor: mapDoctorRecord(doctor)
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(mapUniqueConstraintError(error), 409);
    }

    throw error;
  }
}

export async function deleteCenterDoctor(centerId: number, doctorId: number) {
  return prisma.$transaction(async (tx) => {
    const doctor = await tx.centerUserAccount.findFirst({
      where: {
        id: doctorId,
        centerId,
        role: CenterUserRole.DOCTOR
      }
    });

    if (!doctor) {
      throw new AppError("تعذر العثور على الطبيب المطلوب.", 404);
    }

    const [visitCount, labRequestCount] = await Promise.all([
      tx.localVisit.count({
        where: {
          centerId,
          doctorId
        }
      }),
      tx.labRequestLocal.count({
        where: {
          centerId,
          doctorId
        }
      })
    ]);

    if (visitCount > 0 || labRequestCount > 0) {
      throw new AppError(
        "لا يمكن حذف الطبيب لارتباطه بزيارات أو طلبات مخبرية مسجلة. يمكنك تعطيل الحساب بدلًا من حذفه.",
        409
      );
    }

    await tx.centerUserAccount.delete({
      where: {
        id: doctor.id
      }
    });

    await syncCenterDoctorAvailability(tx, centerId);

    return {
      success: true
    };
  });
}

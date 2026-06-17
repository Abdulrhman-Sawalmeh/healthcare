import { CenterUserRole } from "@prisma/client";

import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error";

const hiddenCenterRoles: CenterUserRole[] = ["LAB_TECH", "PHARMACIST", "NURSE"];

export async function getCentralDashboardData() {
  const [
    connectedCenters,
    suspendedCenters,
    unifiedPatients,
    pendingReferrals,
    pendingCentralNotifications,
    pendingOutgoingNotifications,
    centers,
    recentReferrals,
    recentVisits,
    referralPipeline
  ] = await Promise.all([
    prisma.centralCenter.count({ where: { isConnected: true } }),
    prisma.centralCenter.count({ where: { isConnected: false } }),
    prisma.unifiedPatient.count(),
    prisma.centralReferral.count({ where: { status: "PENDING" } }),
    prisma.centralNotification.count({ where: { status: { in: ["PENDING", "FAILED"] } } }),
    prisma.outgoingNotification.count({ where: { status: { in: ["PENDING", "FAILED"] } } }),
    prisma.centralCenter.findMany({
      include: {
        loadSnapshots: true,
        doctorAvailability: true,
        _count: {
          select: {
            localPatients: true,
            localVisits: true,
            incomingNotifications: true,
            outgoingNotifications: true,
            referralsFrom: true,
            referralsTo: true
          }
        }
      },
      orderBy: {
        centerName: "asc"
      }
    }),
    prisma.centralReferral.findMany({
      include: {
        fromCenter: true,
        toCenter: true,
        patient: true
      },
      orderBy: {
        requestedAt: "desc"
      },
      take: 5
    }),
    prisma.unifiedVisit.findMany({
      include: {
        center: true,
        patient: true
      },
      orderBy: {
        visitDate: "desc"
      },
      take: 6
    }),
    prisma.centralReferral.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    })
  ]);

  return {
    stats: {
      connectedCenters,
      suspendedCenters,
      unifiedPatients,
      pendingReferrals,
      pendingCentralNotifications,
      pendingOutgoingNotifications
    },
    centers: centers.map((center) => ({
      id: center.id,
      code: center.centerCode,
      name: center.centerName,
      type: center.centerType,
      region: center.region,
      city: center.city,
      isConnected: center.isConnected,
      specialties: center.specialties,
      lastSyncAt: center.lastSyncAt,
      currentPatientLoad: center.loadSnapshots[0]?.currentPatientLoad ?? 0,
      averageWaitTime: center.loadSnapshots[0]?.averageWaitTime ?? 0,
      availableSpecialtySlots: center.doctorAvailability.reduce(
        (total, item) => total + item.availableDoctors,
        0
      ),
      patientCount: center._count.localPatients,
      localVisitCount: center._count.localVisits,
      pendingIncoming: center._count.incomingNotifications,
      pendingOutgoing: center._count.outgoingNotifications
    })),
    recentReferrals: recentReferrals.map((referral) => ({
      id: referral.id,
      patientName: referral.patient.fullName,
      patientUnifiedId: referral.patient.unifiedId,
      fromCenter: referral.fromCenter.centerName,
      toCenter: referral.toCenter?.centerName ?? "بانتظار اختيار المركز",
      requiredSpecialty: referral.requiredSpecialty,
      priority: referral.priority,
      status: referral.status,
      estimatedWaitTimeMinutes: referral.estimatedWaitTimeMinutes,
      requestedAt: referral.requestedAt
    })),
    recentVisits: recentVisits.map((visit) => ({
      id: visit.id,
      patientName: visit.patient.fullName,
      centerName: visit.center.centerName,
      primaryDiagnosis: visit.primaryDiagnosis,
      visitType: visit.visitType,
      visitDate: visit.visitDate
    })),
    referralPipeline: referralPipeline.map((item) => ({
      status: item.status,
      count: item._count._all
    }))
  };
}

export async function getCentersOverview() {
  const centers = await prisma.centralCenter.findMany({
    include: {
      doctorAvailability: true,
      operatingRoomStatus: true,
      loadSnapshots: true,
      _count: {
        select: {
          referralsFrom: true,
          referralsTo: true,
          localPatients: true
        }
      }
    },
    orderBy: {
      centerName: "asc"
    }
  });

  return centers.map((center) => ({
    id: center.id,
    code: center.centerCode,
    name: center.centerName,
    type: center.centerType,
    region: center.region,
    city: center.city,
    address: center.address,
    phone: center.phone,
    email: center.email,
    specialties: center.specialties,
    isConnected: center.isConnected,
    suspensionReason: center.suspensionReason,
    lastSyncAt: center.lastSyncAt,
    availableDoctors: center.doctorAvailability.reduce((sum, item) => sum + item.availableDoctors, 0),
    totalDoctors: center.doctorAvailability.reduce((sum, item) => sum + item.totalDoctors, 0),
    operatingRooms: center.operatingRoomStatus[0]
      ? {
          total: center.operatingRoomStatus[0].totalRooms,
          available: center.operatingRoomStatus[0].availableRooms,
          nextAvailableSlot: center.operatingRoomStatus[0].nextAvailableSlot
        }
      : null,
    currentLoad: center.loadSnapshots[0]?.currentPatientLoad ?? 0,
    averageWaitTime: center.loadSnapshots[0]?.averageWaitTime ?? 0,
    referralsOut: center._count.referralsFrom,
    referralsIn: center._count.referralsTo,
    patientCount: center._count.localPatients
  }));
}

export async function getUnifiedPatients(search?: string) {
  const patients = await prisma.unifiedPatient.findMany({
    where: search
      ? {
          OR: [
            { unifiedId: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
            { primaryPhone: { contains: search } },
            { nationalId: { contains: search } }
          ]
        }
      : undefined,
    include: {
      unifiedVisits: {
        include: {
          center: true
        },
        orderBy: {
          visitDate: "desc"
        },
        take: 4
      },
      referrals: {
        include: {
          fromCenter: true,
          toCenter: true
        },
        orderBy: {
          requestedAt: "desc"
        },
        take: 3
      },
      localPatients: {
        include: {
          center: true
        }
      }
    },
    orderBy: {
      fullName: "asc"
    }
  });

  return patients.map((patient) => ({
    id: patient.id,
    unifiedId: patient.unifiedId,
    nationalId: patient.nationalId,
    fullName: patient.fullName,
    primaryPhone: patient.primaryPhone,
    dateOfBirth: patient.dateOfBirth,
    gender: patient.gender,
    address: patient.address,
    bloodType: patient.bloodType,
    allergies: patient.allergies,
    chronicDiseases: patient.chronicDiseases,
    visitCount: patient.unifiedVisits.length,
    referralCount: patient.referrals.length,
    centersSeenAt: patient.localPatients.map((localPatient) => ({
      centerId: localPatient.center.id,
      centerCode: localPatient.center.centerCode,
      centerName: localPatient.center.centerName
    })),
    recentVisits: patient.unifiedVisits.map((visit) => ({
      id: visit.id,
      centerName: visit.center.centerName,
      primaryDiagnosis: visit.primaryDiagnosis,
      visitType: visit.visitType,
      visitDate: visit.visitDate
    })),
    recentReferrals: patient.referrals.map((referral) => ({
      id: referral.id,
      fromCenter: referral.fromCenter.centerName,
      toCenter: referral.toCenter?.centerName ?? "بانتظار التوجيه",
      status: referral.status,
      priority: referral.priority,
      requestedAt: referral.requestedAt
    }))
  }));
}

export async function getCentralReferralsOverview() {
  const referrals = await prisma.centralReferral.findMany({
    include: {
      fromCenter: true,
      toCenter: true,
      patient: true
    },
    orderBy: {
      requestedAt: "desc"
    }
  });

  return referrals.map((referral) => ({
    id: referral.id,
    patientName: referral.patient.fullName,
    patientUnifiedId: referral.patient.unifiedId,
    fromCenter: referral.fromCenter.centerName,
    toCenter: referral.toCenter?.centerName ?? "بانتظار اختيار الجهة المستقبلة",
    requiredSpecialty: referral.requiredSpecialty,
    priority: referral.priority,
    status: referral.status,
    reason: referral.reason,
    selectedCenterReason: referral.selectedCenterReason,
    rejectionReason: referral.rejectionReason,
    estimatedWaitTimeMinutes: referral.estimatedWaitTimeMinutes,
    requestedAt: referral.requestedAt,
    respondedAt: referral.respondedAt,
    notesFromSender: referral.notesFromSender,
    notesFromReceiver: referral.notesFromReceiver
  }));
}

export async function getMasterDataLists() {
  const [medicines, labTests, specialties] = await Promise.all([
    prisma.masterMedicine.findMany({ orderBy: { genericName: "asc" } }),
    prisma.masterLabTest.findMany({ orderBy: { testName: "asc" } }),
    prisma.masterSpecialty.findMany({ orderBy: { specialtyName: "asc" } })
  ]);

  return {
    medicines,
    labTests,
    specialties
  };
}

export async function getReportsSummary() {
  const [referralsByStatus, visitsByCenter, notificationHealth, centerLoad] = await Promise.all([
    prisma.centralReferral.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    }),
    prisma.unifiedVisit.groupBy({
      by: ["centerId"],
      _count: {
        _all: true
      }
    }),
    prisma.centralNotification.groupBy({
      by: ["status"],
      _count: {
        _all: true
      }
    }),
    prisma.centerLoadSnapshot.findMany({
      include: {
        center: true
      },
      orderBy: {
        center: {
          centerName: "asc"
        }
      }
    })
  ]);

  const centers = await prisma.centralCenter.findMany({
    orderBy: {
      centerName: "asc"
    }
  });

  return {
    referralsByStatus: referralsByStatus.map((entry) => ({
      status: entry.status,
      count: entry._count._all
    })),
    visitsByCenter: visitsByCenter.map((entry) => ({
      centerId: entry.centerId,
      centerName: centers.find((center) => center.id === entry.centerId)?.centerName ?? "مركز غير معروف",
      visitCount: entry._count._all
    })),
    notificationHealth: notificationHealth.map((entry) => ({
      status: entry.status,
      count: entry._count._all
    })),
    centerLoad: centerLoad.map((entry) => ({
      centerId: entry.centerId,
      centerName: entry.center.centerName,
      currentPatientLoad: entry.currentPatientLoad,
      averageWaitTime: entry.averageWaitTime
    }))
  };
}

export async function getCenterWorkspaceData(centerId: number, role: string) {
  const [center, team, localPatients, unsyncedVisits, incomingPending, outgoingPending, referrals, recentVisits] =
    await Promise.all([
      prisma.centralCenter.findUnique({
        where: { id: centerId },
        include: {
          loadSnapshots: true,
          doctorAvailability: true,
          operatingRoomStatus: true
        }
      }),
      prisma.centerUserAccount.findMany({
        where: {
          centerId,
          role: {
            notIn: hiddenCenterRoles
          }
        },
        include: {
          doctorProfile: true
        },
        orderBy: [{ role: "asc" }, { fullName: "asc" }]
      }),
      prisma.localPatient.count({ where: { centerId } }),
      prisma.localVisit.count({
        where: {
          centerId,
          syncedToCentral: false
        }
      }),
      prisma.incomingNotification.count({
        where: {
          centerId,
          status: {
            in: ["PENDING", "FAILED"]
          }
        }
      }),
      prisma.outgoingNotification.count({
        where: {
          centerId,
          status: {
            in: ["PENDING", "FAILED"]
          }
        }
      }),
      prisma.centralReferral.findMany({
        where: {
          OR: [{ fromCenterId: centerId }, { toCenterId: centerId }]
        },
        include: {
          patient: true,
          fromCenter: true,
          toCenter: true
        },
        orderBy: {
          requestedAt: "desc"
        },
        take: 6
      }),
      prisma.localVisit.findMany({
        where: { centerId },
        include: {
          patient: true,
          doctor: true,
          prescriptions: true
        },
        orderBy: {
          visitDate: "desc"
        },
        take: 6
      })
    ]);

  if (!center) {
    throw new AppError("تعذر العثور على مساحة عمل المركز.", 404);
  }

  const [labOpenRequests, lowStockItems, invoiceTotals, invoices, inventory, labCatalog] = await Promise.all([
    prisma.labRequestLocal.count({
      where: {
        centerId,
        status: {
          in: ["PENDING", "IN_PROGRESS"]
        }
      }
    }),
    prisma.pharmacyInventoryLocal.count({
      where: {
        centerId,
        quantity: {
          lte: 25
        }
      }
    }),
    prisma.localInvoice.aggregate({
      where: { centerId },
      _sum: {
        amount: true,
        paidAmount: true
      },
      _count: {
        _all: true
      }
    }),
    prisma.localInvoice.findMany({
      where: { centerId },
      select: {
        status: true,
        amount: true,
        paidAmount: true
      }
    }),
    prisma.pharmacyInventoryLocal.findMany({
      where: { centerId },
      select: {
        quantity: true,
        sellingPrice: true
      }
    }),
    prisma.labTestLocal.findMany({
      where: { centerId },
      select: {
        price: true
      }
    })
  ]);

  const invoiceTotal = invoiceTotals._sum.amount ?? 0;
  const invoicePaid = invoiceTotals._sum.paidAmount ?? 0;
  const invoiceOutstanding = Math.max(invoiceTotal - invoicePaid, 0);
  const medicationValue = inventory.reduce(
    (total, item) => total + item.quantity * item.sellingPrice,
    0
  );
  const equipmentBudget = labCatalog.reduce((total, test) => total + test.price * 3, 0) +
    (center.operatingRoomStatus[0]?.availableRooms ?? 0) * 2500;
  const staffBudget = team.length * 5200;
  const patientBudget = localPatients * 45;
  const projectedSpend = staffBudget + medicationValue + equipmentBudget + patientBudget;
  const monthlyLimit = Math.max(projectedSpend * 1.18, 25000);

  return {
    role,
    center: {
      id: center.id,
      code: center.centerCode,
      name: center.centerName,
      type: center.centerType,
      city: center.city,
      region: center.region,
      isConnected: center.isConnected,
      lastSyncAt: center.lastSyncAt,
      averageWaitTime: center.loadSnapshots[0]?.averageWaitTime ?? 0,
      currentPatientLoad: center.loadSnapshots[0]?.currentPatientLoad ?? 0,
      specialties: center.specialties
    },
    stats: {
      localPatients,
      unsyncedVisits,
      incomingPending,
      outgoingPending,
      openReferrals: referrals.filter((item) => item.status === "PENDING").length,
      labOpenRequests,
      lowStockItems
    },
    financial: {
      invoices: {
        total: invoiceTotal,
        paid: invoicePaid,
        outstanding: invoiceOutstanding,
        count: invoiceTotals._count._all,
        unpaidCount: invoices.filter((invoice) => invoice.status !== "PAID").length
      },
      budget: {
        monthlyLimit,
        projectedSpend,
        remaining: Math.max(monthlyLimit - projectedSpend, 0),
        utilizationRate: Math.round((projectedSpend / monthlyLimit) * 100)
      },
      expenses: {
        staff: staffBudget,
        medications: medicationValue,
        equipment: equipmentBudget,
        patients: patientBudget
      }
    },
    team: team.map((member) => ({
      id: member.id,
      fullName: member.fullName,
      role: member.role,
      email: member.email,
      phone: member.phone,
      isActive: member.isActive,
      specialization: member.doctorProfile?.specialization ?? null
    })),
    recentVisits: recentVisits.map((visit) => ({
      id: visit.id,
      patientName: visit.patient.fullName,
      doctorName: visit.doctor?.fullName ?? "غير محدد",
      visitType: visit.visitType,
      diagnosis: visit.diagnosis,
      visitDate: visit.visitDate,
      syncState: visit.syncState,
      prescriptionCount: visit.prescriptions.length
    })),
    referrals: referrals.map((referral) => ({
      id: referral.id,
      patientName: referral.patient.fullName,
      fromCenter: referral.fromCenter.centerName,
      toCenter: referral.toCenter?.centerName ?? "بانتظار التوجيه",
      requiredSpecialty: referral.requiredSpecialty,
      priority: referral.priority,
      status: referral.status,
      requestedAt: referral.requestedAt
    }))
  };
}

export async function getCenterPatients(centerId: number, search?: string) {
  const patients = await prisma.localPatient.findMany({
    where: {
      centerId,
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { unifiedId: { contains: search, mode: "insensitive" } },
              {
                unifiedPatient: {
                  is: {
                    nationalId: {
                      contains: search
                    }
                  }
                }
              }
            ]
          }
        : {})
    },
    include: {
      unifiedPatient: true,
      visits: {
        orderBy: {
          visitDate: "desc"
        },
        take: 3
      },
      invoices: {
        orderBy: {
          invoiceDate: "desc"
        },
        take: 2
      }
    },
    orderBy: {
      fullName: "asc"
    }
  });

  return patients.map((patient) => ({
    id: patient.id,
    unifiedId: patient.unifiedId,
    nationalId: patient.unifiedPatient?.nationalId ?? null,
    fullName: patient.fullName,
    phone: patient.phone,
    gender: patient.gender,
    dateOfBirth: patient.dateOfBirth,
    bloodType: patient.bloodType,
    emergencyContact: patient.emergencyContact,
    chronicDiseases: patient.chronicDiseases,
    allergies: patient.allergies,
    createdLocally: patient.createdLocally,
    visitCount: patient.visits.length,
    billingStatus: patient.invoices[0]?.status ?? "UNPAID",
    recentVisits: patient.visits.map((visit) => ({
      id: visit.id,
      diagnosis: visit.diagnosis,
      visitType: visit.visitType,
      visitDate: visit.visitDate,
      syncState: visit.syncState
    }))
  }));
}

export async function getCenterVisits(centerId: number) {
  const visits = await prisma.localVisit.findMany({
    where: { centerId },
    include: {
      patient: true,
      doctor: true,
      prescriptions: true,
      resultReports: {
        include: {
          author: {
            include: {
              doctorProfile: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      invoice: true
    },
    orderBy: {
      visitDate: "desc"
    }
  });

  return visits.map((visit) => ({
    id: visit.id,
    patientId: visit.patientId,
    doctorId: visit.doctorId,
    patientName: visit.patient.fullName,
    patientUnifiedId: visit.patient.unifiedId,
    doctorName: visit.doctor?.fullName ?? "غير محدد",
    visitType: visit.visitType,
    diagnosis: visit.diagnosis,
    symptoms: visit.symptoms,
    bloodPressure: visit.bloodPressure,
    temperature: visit.temperature,
    heartRate: visit.heartRate,
    visitDate: visit.visitDate,
    visitTime: visit.visitTime,
    syncState: visit.syncState,
    syncedToCentral: visit.syncedToCentral,
    prescriptionCount: visit.prescriptions.length,
    invoiceStatus: visit.invoice?.status ?? "UNPAID",
    notes: visit.notes,
    reports: visit.resultReports.map((report) => ({
      id: report.id,
      title: report.title,
      category: report.category,
      summary: report.summary,
      reportUrl: report.reportUrl,
      findings: report.findings,
      recommendations: report.recommendations,
      recommendedFollowUp: report.recommendedFollowUp,
      shareWithPatient: report.shareWithPatient,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      authorName: report.author.fullName,
      authorSpecialization: report.author.doctorProfile?.specialization ?? null,
      attachment: report.attachmentFileName && report.attachmentMimeType && report.attachmentBase64
        ? {
            fileName: report.attachmentFileName,
            mimeType: report.attachmentMimeType,
            contentBase64: report.attachmentBase64
          }
        : null
    })),
    prescriptions: visit.prescriptions.map((prescription) => ({
      id: prescription.id,
      medicineName: prescription.medicineName,
      dosage: prescription.dosage,
      duration: prescription.duration,
      instructions: prescription.instructions
    }))
  }));
}

export async function getCenterLabData(centerId: number) {
  const [catalog, requests] = await Promise.all([
    prisma.labTestLocal.findMany({
      where: { centerId },
      orderBy: [{ category: "asc" }, { testName: "asc" }]
    }),
    prisma.labRequestLocal.findMany({
      where: { centerId },
      include: {
        patient: true,
        doctor: true,
        test: true
      },
      orderBy: {
        requestDate: "desc"
      }
    })
  ]);

  return {
    catalog,
    requests: requests.map((request) => ({
      id: request.id,
      patientId: request.patientId,
      doctorId: request.doctorId,
      testId: request.testId,
      patientName: request.patient.fullName,
      doctorName: request.doctor.fullName,
      testName: request.test.testName,
      category: request.test.category,
      status: request.status,
      requestDate: request.requestDate,
      resultValue: request.resultValue,
      resultDate: request.resultDate
    }))
  };
}

export async function getCenterPharmacyData(centerId: number) {
  const inventory = await prisma.pharmacyInventoryLocal.findMany({
    where: { centerId },
    orderBy: [{ quantity: "asc" }, { medicineName: "asc" }]
  });

  return inventory.map((item) => ({
    id: item.id,
    medicineName: item.medicineName,
    batchNumber: item.batchNumber,
    quantity: item.quantity,
    unit: item.unit,
    expiryDate: item.expiryDate,
    sellingPrice: item.sellingPrice,
    reorderLevel: item.reorderLevel,
    isLowStock: item.quantity <= item.reorderLevel
  }));
}

export async function getCenterNotifications(centerId: number) {
  const [incoming, outgoing, alerts, logs] = await Promise.all([
    prisma.incomingNotification.findMany({
      where: { centerId },
      orderBy: {
        receivedAt: "desc"
      },
      take: 20
    }),
    prisma.outgoingNotification.findMany({
      where: { centerId },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    }),
    prisma.centerSystemAlert.findMany({
      where: { centerId },
      orderBy: {
        createdAt: "desc"
      },
      take: 12
    }),
    prisma.notificationProcessingLog.findMany({
      where: { centerId },
      orderBy: {
        createdAt: "desc"
      },
      take: 20
    })
  ]);

  return {
    incoming,
    outgoing,
    alerts,
    logs
  };
}

export async function getRoleMenuSummary(centerId: number) {
  const team = await prisma.centerUserAccount.groupBy({
    by: ["role"],
    where: { centerId },
    _count: {
      _all: true
    }
  });

  return team.reduce<Record<CenterUserRole, number>>(
    (accumulator, item) => {
      accumulator[item.role] = item._count._all;
      return accumulator;
    },
    {
      CENTER_MANAGER: 0,
      DOCTOR: 0,
      RECEPTIONIST: 0,
      LAB_TECH: 0,
      PHARMACIST: 0,
      NURSE: 0
    }
  );
}

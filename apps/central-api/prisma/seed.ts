import bcrypt from "bcryptjs";
import { subDays } from "date-fns";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);

  await prisma.notificationProcessingLog.deleteMany();
  await prisma.centerSystemAlert.deleteMany();
  await prisma.outgoingNotification.deleteMany();
  await prisma.incomingNotification.deleteMany();
  await prisma.pharmacyInventoryLocal.deleteMany();
  await prisma.labRequestLocal.deleteMany();
  await prisma.labTestLocal.deleteMany();
  await prisma.localInvoice.deleteMany();
  await prisma.localPrescription.deleteMany();
  await prisma.localVisit.deleteMany();
  await prisma.localPatient.deleteMany();
  await prisma.centerUserAccount.deleteMany();
  await prisma.centerConfig.deleteMany();
  await prisma.communicationLog.deleteMany();
  await prisma.centerNotification.deleteMany();
  await prisma.centralNotification.deleteMany();
  await prisma.centerLoadSnapshot.deleteMany();
  await prisma.centerMedicineAvailability.deleteMany();
  await prisma.centerOperatingRoomAvailability.deleteMany();
  await prisma.centerDoctorAvailability.deleteMany();
  await prisma.centralReferral.deleteMany();
  await prisma.unifiedVisit.deleteMany();
  await prisma.unifiedPatient.deleteMany();
  await prisma.masterSpecialty.deleteMany();
  await prisma.masterLabTest.deleteMany();
  await prisma.masterMedicine.deleteMany();
  await prisma.centralUser.deleteMany();
  await prisma.centralCenter.deleteMany();

  // تنظيف البيانات التجريبية القديمة حتى يبدأ المشروع من نموذج الشبكة الصحية الجديد.
  await prisma.payment.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.kpiSnapshot.deleteMany();
  await prisma.centerAdministrator.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany();
  await prisma.center.deleteMany();

  const centralAdmin = await prisma.centralUser.create({
    data: {
      username: "central.admin",
      passwordHash,
      fullName: "د. سلمى أبو سمرة",
      email: "central.admin@shifaa.local"
    }
  });

  const clinic = await prisma.centralCenter.create({
    data: {
      centerCode: "C001",
      centerName: "مركز الحسين الصحي الصغير",
      centerType: "CLINIC",
      region: "القدس",
      city: "القدس",
      address: "شارع البلدية 12",
      phone: "+970-2-555-1000",
      email: "contact@hussein-center.local",
      latitude: 31.7683,
      longitude: 35.2137,
      specialties: ["طب الأسرة", "الطب العام"],
      apiEndpoint: "https://clinic-c001.local/api",
      apiKey: "CENTER-C001-KEY",
      lastSyncAt: subDays(new Date(), 1)
    }
  });

  const medicalCenter = await prisma.centralCenter.create({
    data: {
      centerCode: "M002",
      centerName: "مركز الشفاء الصحي المتوسط",
      centerType: "MEDICAL_CENTER",
      region: "رام الله والبيرة",
      city: "رام الله",
      address: "شارع المنطقة الصحية 45",
      phone: "+970-2-555-2200",
      email: "info@shifaa-medical.local",
      latitude: 31.8996,
      longitude: 35.2042,
      specialties: ["أمراض القلب", "الأشعة التشخيصية", "الطب الباطني"],
      apiEndpoint: "https://medical-m002.local/api",
      apiKey: "CENTER-M002-KEY",
      lastSyncAt: subDays(new Date(), 1)
    }
  });

  await prisma.centerConfig.createMany({
    data: [
      clinic,
      medicalCenter
    ].flatMap((center) => [
      {
        centerId: center.id,
        configKey: "center_type",
        configValue: center.centerType.toLowerCase(),
        description: "نوع المركز ضمن الشبكة الصحية"
      },
      {
        centerId: center.id,
        configKey: "center_name",
        configValue: center.centerName,
        description: "الاسم المعروض للمركز"
      },
      {
        centerId: center.id,
        configKey: "center_code",
        configValue: center.centerCode,
        description: "الرمز المركزي الفريد للمركز"
      },
      {
        centerId: center.id,
        configKey: "central_api_url",
        configValue: "https://central.shifaa.local/api",
        description: "عنوان واجهة النظام المركزي"
      },
      {
        centerId: center.id,
        configKey: "center_api_key",
        configValue: center.apiKey ?? "",
        description: "مفتاح الواجهة الصادر عن النظام المركزي"
      },
      {
        centerId: center.id,
        configKey: "sync_interval_hours",
        configValue: "6",
        description: "الفاصل الزمني المتوقع لمزامنة الزيارات بالساعات"
      },
      {
        centerId: center.id,
        configKey: "max_retry_attempts",
        configValue: "24",
        description: "الحد الأقصى لمحاولات إعادة إرسال الإشعارات"
      },
      {
        centerId: center.id,
        configKey: "retry_interval_minutes",
        configValue: "60",
        description: "الفاصل الزمني بالدقائق بين محاولات إعادة الإرسال"
      }
    ])
  });

  const managerClinic = await prisma.centerUserAccount.create({
    data: {
      centerId: clinic.id,
      username: "manager.hussein",
      passwordHash,
      fullName: "رنا درويش",
      role: "CENTER_MANAGER",
      phone: "+970-59-111-0001",
      email: "manager.hussein@shifaa.local"
    }
  });

  const doctorClinic = await prisma.centerUserAccount.create({
    data: {
      centerId: clinic.id,
      username: "doctor.hussein",
      passwordHash,
      fullName: "د. عمر ناصر",
      role: "DOCTOR",
      phone: "+970-59-111-0002",
      email: "doctor.hussein@shifaa.local",
      createdById: managerClinic.id
    }
  });

  const receptionistClinic = await prisma.centerUserAccount.create({
    data: {
      centerId: clinic.id,
      username: "reception.hussein",
      passwordHash,
      fullName: "هبة قاسم",
      role: "RECEPTIONIST",
      phone: "+970-59-111-0003",
      email: "reception.hussein@shifaa.local",
      createdById: managerClinic.id
    }
  });

  const managerMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "manager.shifaa",
      passwordHash,
      fullName: "مها خلف",
      role: "CENTER_MANAGER",
      phone: "+970-59-222-0001",
      email: "manager.shifaa@shifaa.local"
    }
  });

  const doctorMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "doctor.shifaa",
      passwordHash,
      fullName: "د. لينا حداد",
      role: "DOCTOR",
      phone: "+970-59-222-0002",
      email: "doctor.shifaa@shifaa.local",
      createdById: managerMedical.id
    }
  });

  const receptionistMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "reception.shifaa",
      passwordHash,
      fullName: "سامر عودة",
      role: "RECEPTIONIST",
      phone: "+970-59-222-0003",
      email: "reception.shifaa@shifaa.local",
      createdById: managerMedical.id
    }
  });

  const labTechMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "lab.shifaa",
      passwordHash,
      fullName: "بسمة خوري",
      role: "LAB_TECH",
      phone: "+970-59-222-0004",
      email: "lab.shifaa@shifaa.local",
      createdById: managerMedical.id
    }
  });

  const pharmacistMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "pharmacy.shifaa",
      passwordHash,
      fullName: "أحمد صلحب",
      role: "PHARMACIST",
      phone: "+970-59-222-0005",
      email: "pharmacy.shifaa@shifaa.local",
      createdById: managerMedical.id
    }
  });

  const nurseMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "nurse.shifaa",
      passwordHash,
      fullName: "نور صبري",
      role: "NURSE",
      phone: "+970-59-222-0006",
      email: "nurse.shifaa@shifaa.local",
      createdById: managerMedical.id
    }
  });

  const [amlodipine, aspirin, atorvastatin] = await Promise.all([
    prisma.masterMedicine.create({
      data: {
        genericName: "أملوديبين",
        brandName: "نورفاسك",
        category: "أمراض القلب",
        unit: "قرص",
        isCritical: true
      }
    }),
    prisma.masterMedicine.create({
      data: {
        genericName: "أسبرين",
        brandName: "أسبيكارد",
        category: "أمراض القلب",
        unit: "قرص"
      }
    }),
    prisma.masterMedicine.create({
      data: {
        genericName: "أتورفاستاتين",
        brandName: "ليبيتور",
        category: "الطب الباطني",
        unit: "قرص"
      }
    })
  ]);

  await Promise.all([
    prisma.masterLabTest.create({
      data: {
        testName: "تعداد دم كامل (CBC)",
        category: "أمراض الدم",
        normalRange: "للبالغين: 4.5 - 11.0 × 10^9/لتر"
      }
    }),
    prisma.masterLabTest.create({
      data: {
        testName: "دهون الدم الشاملة",
        category: "أمراض القلب",
        normalRange: "الكوليسترول الكلي أقل من 200 ملغم/دل"
      }
    }),
    prisma.masterLabTest.create({
      data: {
        testName: "تروبونين",
        category: "الطوارئ",
        normalRange: "أقل من 0.04 نانوغرام/مل"
      }
    }),
    prisma.masterSpecialty.create({
      data: {
        specialtyName: "أمراض القلب",
        description: "تشخيص أمراض القلب والأوعية الدموية وعلاجها."
      }
    }),
    prisma.masterSpecialty.create({
      data: {
        specialtyName: "الأشعة التشخيصية",
        description: "الفحوصات التصويرية وقراءة نتائجها."
      }
    }),
    prisma.masterSpecialty.create({
      data: {
        specialtyName: "طب الطوارئ",
        description: "فرز الحالات الطارئة وتثبيتها وعلاجها الأولي."
      }
    })
  ]);

  await prisma.centerDoctorAvailability.createMany({
    data: [
      { centerId: clinic.id, specialty: "طب الأسرة", availableDoctors: 1, totalDoctors: 1 },
      { centerId: medicalCenter.id, specialty: "أمراض القلب", availableDoctors: 2, totalDoctors: 3 },
      { centerId: medicalCenter.id, specialty: "الأشعة التشخيصية", availableDoctors: 1, totalDoctors: 1 }
    ]
  });

  await prisma.centerOperatingRoomAvailability.createMany({
    data: [
      { centerId: clinic.id, totalRooms: 0, availableRooms: 0 },
      { centerId: medicalCenter.id, totalRooms: 1, availableRooms: 1, nextAvailableSlot: subDays(new Date(), -1) }
    ]
  });

  await prisma.centerMedicineAvailability.createMany({
    data: [
      { centerId: clinic.id, medicineId: amlodipine.id, availableQuantity: 54, isAvailable: true },
      { centerId: clinic.id, medicineId: aspirin.id, availableQuantity: 120, isAvailable: true },
      { centerId: medicalCenter.id, medicineId: amlodipine.id, availableQuantity: 140, isAvailable: true },
      { centerId: medicalCenter.id, medicineId: aspirin.id, availableQuantity: 180, isAvailable: true },
      { centerId: medicalCenter.id, medicineId: atorvastatin.id, availableQuantity: 90, isAvailable: true }
    ]
  });

  await prisma.centerLoadSnapshot.createMany({
    data: [
      { centerId: clinic.id, currentPatientLoad: 44, averageWaitTime: 24 },
      { centerId: medicalCenter.id, currentPatientLoad: 61, averageWaitTime: 32 }
    ]
  });

  const yousef = await prisma.unifiedPatient.create({
    data: {
      unifiedId: "P-2026-0001001",
      nationalId: "402010101",
      fullName: "يوسف درويش",
      dateOfBirth: new Date("1988-07-10"),
      gender: "MALE",
      primaryPhone: "0599000101",
      secondaryPhone: "0599000102",
      address: "القدس - رأس العامود",
      bloodType: "A+",
      allergies: ["حساسية من البنسلين"],
      chronicDiseases: ["ارتفاع ضغط الدم", "فرط شحميات الدم"]
    }
  });

  const mariam = await prisma.unifiedPatient.create({
    data: {
      unifiedId: "P-2026-0001002",
      nationalId: "402010102",
      fullName: "مريم خليل",
      dateOfBirth: new Date("1995-11-21"),
      gender: "FEMALE",
      primaryPhone: "0599000201",
      address: "رام الله - الطيرة",
      bloodType: "O+",
      allergies: [],
      chronicDiseases: ["داء السكري"]
    }
  });

  const clinicPatient = await prisma.localPatient.create({
    data: {
      centerId: clinic.id,
      unifiedPatientId: yousef.id,
      unifiedId: yousef.unifiedId,
      fullName: yousef.fullName,
      dateOfBirth: yousef.dateOfBirth,
      gender: yousef.gender,
      phone: yousef.primaryPhone,
      address: yousef.address,
      emergencyContact: "مريم درويش - 0599000999",
      bloodType: yousef.bloodType,
      allergies: yousef.allergies,
      chronicDiseases: yousef.chronicDiseases,
      createdLocally: false
    }
  });

  const medicalPatient = await prisma.localPatient.create({
    data: {
      centerId: medicalCenter.id,
      unifiedPatientId: mariam.id,
      unifiedId: mariam.unifiedId,
      fullName: mariam.fullName,
      dateOfBirth: mariam.dateOfBirth,
      gender: mariam.gender,
      phone: mariam.primaryPhone,
      address: mariam.address,
      emergencyContact: "خليل مريم - 0599000222",
      bloodType: mariam.bloodType,
      allergies: mariam.allergies,
      chronicDiseases: mariam.chronicDiseases,
      createdLocally: false
    }
  });

  const syncedClinicVisit = await prisma.localVisit.create({
    data: {
      centerId: clinic.id,
      patientId: clinicPatient.id,
      doctorId: doctorClinic.id,
      visitDate: subDays(new Date(), 10),
      visitTime: "09:15",
      visitType: "FOLLOW_UP",
      symptoms: "صداع مع ارتفاع قراءات ضغط الدم",
      bloodPressure: "150/95",
      temperature: 36.7,
      heartRate: 84,
      diagnosis: "متابعة ارتفاع ضغط الدم الشرياني",
      notes: "تم تعديل الخطة الدوائية",
      syncState: "SYNCED",
      syncedToCentral: true
    }
  });

  const unifiedClinicVisit = await prisma.unifiedVisit.create({
    data: {
      patientId: yousef.id,
      centerId: clinic.id,
      visitDate: syncedClinicVisit.visitDate,
      primaryDiagnosis: syncedClinicVisit.diagnosis,
      visitType: syncedClinicVisit.visitType,
      doctorName: doctorClinic.fullName,
      centerVisitId: `${clinic.centerCode}-${syncedClinicVisit.id}`
    }
  });

  await prisma.localVisit.update({
    where: { id: syncedClinicVisit.id },
    data: {
      centralVisitId: unifiedClinicVisit.id
    }
  });

  const unsyncedClinicVisit = await prisma.localVisit.create({
    data: {
      centerId: clinic.id,
      patientId: clinicPatient.id,
      doctorId: doctorClinic.id,
      visitDate: subDays(new Date(), 1),
      visitTime: "11:20",
      visitType: "CONSULTATION",
      symptoms: "ألم صدري ضاغط مع دوار",
      bloodPressure: "165/102",
      temperature: 37.1,
      heartRate: 92,
      diagnosis: "اشتباه متلازمة إكليلية حادة",
      notes: "تحتاج الحالة إلى إحالة تخصصية بعد التقييم المركزي",
      syncState: "PENDING",
      syncedToCentral: false
    }
  });

  await prisma.localPrescription.createMany({
    data: [
      {
        visitId: syncedClinicVisit.id,
        medicineName: "أملوديبين",
        dosage: "5 ملغ مرة يوميًا",
        duration: "30 يومًا",
        instructions: "يؤخذ بعد الإفطار",
        dispensed: true
      },
      {
        visitId: unsyncedClinicVisit.id,
        medicineName: "أسبرين",
        dosage: "81 ملغ مرة يوميًا",
        duration: "14 يومًا",
        instructions: "يؤخذ مع الماء بعد الطعام"
      }
    ]
  });

  await prisma.localInvoice.createMany({
    data: [
      {
        centerId: clinic.id,
        patientId: clinicPatient.id,
        visitId: syncedClinicVisit.id,
        amount: 80,
        paidAmount: 80,
        status: "PAID",
        paymentMethod: "CASH",
        invoiceDate: subDays(new Date(), 10)
      },
      {
        centerId: clinic.id,
        patientId: clinicPatient.id,
        visitId: unsyncedClinicVisit.id,
        amount: 120,
        paidAmount: 60,
        status: "PARTIAL",
        paymentMethod: "CARD",
        invoiceDate: subDays(new Date(), 1)
      }
    ]
  });

  const lipidPanel = await prisma.labTestLocal.create({
    data: {
      centerId: medicalCenter.id,
      testName: "دهون الدم الشاملة",
      category: "أمراض القلب",
      normalRange: "الكوليسترول الكلي أقل من 200 ملغم/دل",
      price: 75
    }
  });

  await prisma.labRequestLocal.create({
    data: {
      centerId: medicalCenter.id,
      patientId: medicalPatient.id,
      doctorId: doctorMedical.id,
      testId: lipidPanel.id,
      requestDate: subDays(new Date(), 2),
      status: "IN_PROGRESS"
    }
  });

  await prisma.pharmacyInventoryLocal.createMany({
    data: [
      {
        centerId: medicalCenter.id,
        medicineName: "Amlodipine",
        batchNumber: "AMLO-2401",
        quantity: 44,
        unit: "tablet",
        expiryDate: new Date("2027-08-01"),
        sellingPrice: 12,
        reorderLevel: 20
      },
      {
        centerId: medicalCenter.id,
        medicineName: "Aspirin",
        batchNumber: "ASP-2401",
        quantity: 12,
        unit: "tablet",
        expiryDate: new Date("2027-05-01"),
        sellingPrice: 8,
        reorderLevel: 25
      }
    ]
  });

  const acceptedReferral = await prisma.centralReferral.create({
    data: {
      fromCenterId: clinic.id,
      toCenterId: medicalCenter.id,
      patientId: yousef.id,
      requiredSpecialty: "أمراض القلب",
      priority: "URGENT",
      reason: "الحاجة إلى تقييم تخصصي قلبي ومراقبة سريرية أدق",
      requiresOr: false,
      requiredMedicineIds: [amlodipine.id, aspirin.id],
      preferredRegion: "رام الله والبيرة",
      maxDistanceKm: 120,
      status: "ACCEPTED",
      selectedCenterReason:
        "تم اختيار مركز الشفاء الصحي المتوسط بناءً على توفر اختصاص أمراض القلب وقرب المسافة وملاءمة متوسط الانتظار.",
      estimatedWaitTimeMinutes: 32,
      requestedAt: subDays(new Date(), 3),
      respondedAt: subDays(new Date(), 3),
      notesFromSender: "المريض يحتاج إلى تقييم عاجل بسبب تكرر الألم الصدري وارتفاع الضغط."
    }
  });

  const visitPullNotification = await prisma.centralNotification.create({
    data: {
      notificationType: "REQUEST_NEW_VISITS",
      targetCenterId: clinic.id,
      payload: {
        from_date: subDays(new Date(), 2).toISOString(),
        to_date: new Date().toISOString(),
        max_records: 100
      },
      status: "PENDING"
    }
  });

  const referralNotify = await prisma.centralNotification.create({
    data: {
      notificationType: "NOTIFY_REFERRAL",
      targetCenterId: medicalCenter.id,
      payload: {
        referral_id: acceptedReferral.id,
        patient_unified_id: yousef.unifiedId,
        required_specialty: "أمراض القلب",
        priority: "URGENT"
      },
      status: "ACKNOWLEDGED",
      sentAt: subDays(new Date(), 3),
      acknowledgedAt: subDays(new Date(), 3)
    }
  });

  const centerReferralRequest = await prisma.centerNotification.create({
    data: {
      fromCenterId: clinic.id,
      notificationType: "REFERRAL_REQUEST",
      payload: {
        patient_unified_id: yousef.unifiedId,
        required_specialty: "أمراض القلب",
        priority: "URGENT",
        max_distance_km: 120
      },
      status: "COMPLETED",
      receivedAt: subDays(new Date(), 3),
      processedAt: subDays(new Date(), 3),
      responseSent: true,
      notes: "تمت المعالجة آليًا عبر محرك الإحالات."
    }
  });

  const incomingRequest = await prisma.incomingNotification.create({
    data: {
      centerId: clinic.id,
      centralNotificationId: visitPullNotification.id,
      notificationType: "REQUEST_NEW_VISITS",
      payload: visitPullNotification.payload,
      status: "PENDING"
    }
  });

  const outgoingReferral = await prisma.outgoingNotification.create({
    data: {
      centerId: clinic.id,
      notificationType: "REFERRAL_REQUEST",
      payload: {
        patient_unified_id: yousef.unifiedId,
        required_specialty: "أمراض القلب",
        priority: "URGENT",
        reason: "الحاجة إلى تقييم قلبي تخصصي متقدم",
        required_medicine_ids: [amlodipine.id, aspirin.id]
      },
      status: "PENDING",
      nextRetryAt: new Date()
    }
  });

  await prisma.notificationProcessingLog.createMany({
    data: [
      {
        centerId: clinic.id,
        incomingNotificationId: incomingRequest.id,
        severity: "INFO",
        message: "طلب النظام المركزي الزيارات غير المزامنة خلال آخر 48 ساعة."
      },
      {
        centerId: clinic.id,
        outgoingNotificationId: outgoingReferral.id,
        severity: "WARNING",
        message: "تمت إضافة طلب الإحالة إلى الطابور بانتظار المعالجة اليدوية أو المجدولة."
      }
    ]
  });

  await prisma.centerSystemAlert.create({
    data: {
      centerId: clinic.id,
      alertType: "notification_failure",
      severity: "WARNING",
      title: "إحالة صادرة بانتظار الإرسال",
      message: "يوجد طلب إحالة واحد ما زال بانتظار الإرسال إلى النظام المركزي."
    }
  });

  await prisma.communicationLog.createMany({
    data: [
      {
        centerId: clinic.id,
        direction: "FROM_CENTER",
        notificationType: "REFERRAL_REQUEST",
        status: "COMPLETED",
        requestPayload: centerReferralRequest.payload,
        responsePayload: {
          referral_id: acceptedReferral.id,
          to_center: medicalCenter.centerName
        }
      },
      {
        centerId: medicalCenter.id,
        direction: "TO_CENTER",
        notificationType: "NOTIFY_REFERRAL",
        status: "ACKNOWLEDGED",
        requestPayload: referralNotify.payload
      }
    ]
  });

  console.log("اكتملت زراعة البيانات التجريبية للشبكة الصحية العربية.");
  console.log("مدير النظام المركزي: central.admin / Password123!");
  console.log("مدير المركز الصحي الصغير: manager.hussein / Password123!");
  console.log("طبيب المركز الصحي الصغير: doctor.hussein / Password123!");
  console.log("موظف استقبال المركز الصحي الصغير: reception.hussein / Password123!");
  console.log("مدير المركز الصحي المتوسط: manager.shifaa / Password123!");
  console.log("طبيب المركز الصحي المتوسط: doctor.shifaa / Password123!");
  console.log("موظف استقبال المركز الصحي المتوسط: reception.shifaa / Password123!");
  console.log("فني مختبر المركز الصحي المتوسط: lab.shifaa / Password123!");
  console.log("صيدلي المركز الصحي المتوسط: pharmacy.shifaa / Password123!");
  console.log("ممرض المركز الصحي المتوسط: nurse.shifaa / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

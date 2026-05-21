import { subDays } from "date-fns";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = "Password123!";

  await prisma.notificationProcessingLog.deleteMany();
  await prisma.centerSystemAlert.deleteMany();
  await prisma.outgoingNotification.deleteMany();
  await prisma.incomingNotification.deleteMany();
  await prisma.pharmacyInventoryLocal.deleteMany();
  await prisma.labRequestLocal.deleteMany();
  await prisma.labTestLocal.deleteMany();
  await prisma.localInvoice.deleteMany();
  await prisma.localResultReport.deleteMany();
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
      username: "سلمى.أبوسمرة&001",
      passwordHash,
      fullName: "د. سلمى أبو سمرة",
      email: "سلمى.أبوسمرة&001@central.org"
    }
  });

  const clinic = await prisma.centralCenter.create({
    data: {
      centerCode: "C001",
      centerName: "مركز الحسين الصحي",
      centerType: "CLINIC",
      region: "القدس",
      city: "القدس",
      address: "شارع البلدية 12",
      phone: "+970-2-555-1000",
      email: "contact&001@مركزالحسينالصحي.org",
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
      centerName: "مركز الشفاء الصحي",
      centerType: "MEDICAL_CENTER",
      region: "رام الله والبيرة",
      city: "رام الله",
      address: "شارع المنطقة الصحية 45",
      phone: "+970-2-555-2200",
      email: "contact&001@مركزالشفاءالصحي.org",
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
      username: "رنا.درويش&001",
      passwordHash,
      fullName: "رنا درويش",
      role: "CENTER_MANAGER",
      phone: "+970-59-111-0001",
      email: "رنا.درويش&001@مركزالحسينالصحي.org"
    }
  });

  const doctorClinic = await prisma.centerUserAccount.create({
    data: {
      centerId: clinic.id,
      username: "عمر.ناصر&001",
      passwordHash,
      fullName: "د. عمر ناصر",
      role: "DOCTOR",
      phone: "+970-59-111-0002",
      email: "عمر.ناصر&001@مركزالحسينالصحي.org",
      createdById: managerClinic.id
    }
  });

  const receptionistClinic = await prisma.centerUserAccount.create({
    data: {
      centerId: clinic.id,
      username: "هبة.قاسم&001",
      passwordHash,
      fullName: "هبة قاسم",
      role: "RECEPTIONIST",
      phone: "+970-59-111-0003",
      email: "هبة.قاسم&001@مركزالحسينالصحي.org",
      createdById: managerClinic.id
    }
  });

  const managerMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "مها.خلف&001",
      passwordHash,
      fullName: "مها خلف",
      role: "CENTER_MANAGER",
      phone: "+970-59-222-0001",
      email: "مها.خلف&001@مركزالشفاءالصحي.org"
    }
  });

  const doctorMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "لينا.حداد&001",
      passwordHash,
      fullName: "د. لينا حداد",
      role: "DOCTOR",
      phone: "+970-59-222-0002",
      email: "لينا.حداد&001@مركزالشفاءالصحي.org",
      createdById: managerMedical.id
    }
  });

  const receptionistMedical = await prisma.centerUserAccount.create({
    data: {
      centerId: medicalCenter.id,
      username: "سامر.عودة&001",
      passwordHash,
      fullName: "سامر عودة",
      role: "RECEPTIONIST",
      phone: "+970-59-222-0003",
      email: "سامر.عودة&001@مركزالشفاءالصحي.org",
      createdById: managerMedical.id
    }
  });

  await Promise.all([
    prisma.centerDoctorProfile.create({
      data: {
        userAccountId: doctorClinic.id,
        centerId: clinic.id,
        nationalId: "901010101",
        gender: "MALE",
        specialization: "طب الأسرة",
        yearsExperience: 8,
        licenseNumber: "LIC-C001-DR-01",
        qualification: "البورد الفلسطيني في طب الأسرة",
        shiftDays: ["SUNDAY", "MONDAY", "WEDNESDAY", "THURSDAY"],
        shiftStartTime: "08:00",
        shiftEndTime: "14:00",
        consultationRoom: "عيادة 1",
        hireDate: subDays(new Date(), 1200),
        bio: "يتابع العيادة العامة وحالات الأمراض المزمنة داخل المركز.",
        notes: "مرجع أولي لتحويلات الرعاية الأولية."
      }
    }),
    prisma.centerDoctorProfile.create({
      data: {
        userAccountId: doctorMedical.id,
        centerId: medicalCenter.id,
        nationalId: "902020202",
        gender: "FEMALE",
        specialization: "أمراض القلب",
        yearsExperience: 11,
        licenseNumber: "LIC-M002-DR-01",
        qualification: "اختصاص قلب وقسطرة تشخيصية",
        shiftDays: ["SUNDAY", "TUESDAY", "WEDNESDAY", "THURSDAY"],
        shiftStartTime: "09:00",
        shiftEndTime: "16:00",
        consultationRoom: "عيادة القلب",
        hireDate: subDays(new Date(), 1800),
        bio: "تشرف على عيادة القلب وتقييم الإحالات القلبية الواردة.",
        notes: "تنسق المواعيد التشخيصية مع الأشعة والمختبر."
      }
    })
  ]);

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
      { centerId: medicalCenter.id, specialty: "أمراض القلب", availableDoctors: 1, totalDoctors: 1 },
      { centerId: medicalCenter.id, specialty: "الأشعة التشخيصية", availableDoctors: 0, totalDoctors: 0 }
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

  const medicalFollowUpVisit = await prisma.localVisit.create({
    data: {
      centerId: medicalCenter.id,
      patientId: medicalPatient.id,
      doctorId: doctorMedical.id,
      visitDate: subDays(new Date(), 4),
      visitTime: "10:40",
      visitType: "FOLLOW_UP",
      symptoms: "خفقان متقطع بعد الجهد مع حاجة لمراجعة التحاليل الوقائية",
      bloodPressure: "128/82",
      temperature: 36.6,
      heartRate: 79,
      diagnosis: "متابعة قلبية دورية مع مراجعة دهون الدم",
      notes: "تم طلب تقرير نتائج مبسط للمريضة مع توصيات المتابعة المنزلية.",
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
      },
      {
        visitId: medicalFollowUpVisit.id,
        medicineName: "أتورفاستاتين",
        dosage: "20 ملغ مساءً",
        duration: "30 يومًا",
        instructions: "مع الاستمرار على الحمية وتقليل الدهون المشبعة"
      }
    ]
  });

  await prisma.localResultReport.create({
    data: {
      centerId: medicalCenter.id,
      patientId: medicalPatient.id,
      visitId: medicalFollowUpVisit.id,
      authorId: doctorMedical.id,
      title: "ملخص نتائج متابعة القلب والدهون",
      category: "LAB",
      summary:
        "النتائج الحالية مستقرة سريريًا، ولا توجد مؤشرات على تدهور حاد. نوصي بالاستمرار على الخطة الوقائية الحالية مع مراجعة الدهون بعد 6 أسابيع.",
      findings:
        "العلامات الحيوية ضمن الحدود المقبولة، ولا توجد شكوى صدرية حادة أثناء الزيارة. مخطط المتابعة القلبية مستقر حتى الآن.",
      recommendations:
        "الاستمرار على العلاج الوقائي، متابعة النشاط البدني الخفيف، وإحضار نتائج الدهون والسكر التراكمي في الزيارة القادمة.",
      recommendedFollowUp: "مراجعة قلبية خلال 6 أسابيع أو أسرع إذا عاد الخفقان بشكل متكرر.",
      shareWithPatient: true
    }
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
        "تم اختيار مركز الشفاء الصحي بناءً على توفر اختصاص أمراض القلب وقرب المسافة وملاءمة متوسط الانتظار.",
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

  const legacyClinic = await prisma.center.create({
    data: {
      name: "مركز الحسين الصحي",
      code: "C001",
      city: "القدس",
      address: "شارع البلدية 12",
      phone: "+970-2-555-1000",
      email: "portal&001@مركزالحسينالصحي.org",
      description: "بوابة مرضى للرعاية الأولية ومتابعة الأمراض المزمنة."
    }
  });

  const legacyMedicalCenter = await prisma.center.create({
    data: {
      name: "مركز الشفاء الصحي",
      code: "M002",
      city: "رام الله",
      address: "شارع المنطقة الصحية 45",
      phone: "+970-2-555-2200",
      email: "portal&001@مركزالشفاءالصحي.org",
      description: "بوابة مرضى للمواعيد التخصصية والمتابعة القلبية والمحادثات الطبية."
    }
  });

  const [clinicFamilyDepartment, medicalCardiologyDepartment, medicalInternalDepartment] = await Promise.all([
    prisma.department.create({
      data: {
        centerId: legacyClinic.id,
        name: "طب الأسرة",
        floor: 1,
        phone: "+970-2-555-1001",
        description: "عيادة المتابعة الأولية وارتفاع ضغط الدم والسكري."
      }
    }),
    prisma.department.create({
      data: {
        centerId: legacyMedicalCenter.id,
        name: "أمراض القلب",
        floor: 2,
        phone: "+970-2-555-2201",
        description: "عيادة تقييم الذبحة الصدرية واضطرابات النظم ومتابعة ضغط الدم."
      }
    }),
    prisma.department.create({
      data: {
        centerId: legacyMedicalCenter.id,
        name: "الطب الباطني",
        floor: 2,
        phone: "+970-2-555-2202",
        description: "متابعة الأمراض المزمنة والاستشارات الباطنية العامة."
      }
    })
  ]);

  const [
    clinicDoctorUser,
    medicalDoctorUser,
    medicalInternalDoctorUser,
    clinicPatientUser,
    medicalPatientUser
  ] = await Promise.all([
    prisma.user.create({
      data: {
        email: "عمر.ناصر&001@مركزالحسينالصحي.org",
        passwordHash,
        fullName: "د. عمر ناصر",
        phone: "+970-59-111-1001",
        role: "DOCTOR"
      }
    }),
    prisma.user.create({
      data: {
        email: "لينا.حداد&001@مركزالشفاءالصحي.org",
        passwordHash,
        fullName: "د. لينا حداد",
        phone: "+970-59-222-1001",
        role: "DOCTOR"
      }
    }),
    prisma.user.create({
      data: {
        email: "سامر.عودة&002@مركزالشفاءالصحي.org",
        passwordHash,
        fullName: "د. سامر عودة",
        phone: "+970-59-222-1002",
        role: "DOCTOR"
      }
    }),
    prisma.user.create({
      data: {
        email: "يوسف.درويش&001@مركزالحسينالصحي.org",
        passwordHash,
        fullName: "يوسف درويش",
        phone: "0599000101",
        role: "PATIENT"
      }
    }),
    prisma.user.create({
      data: {
        email: "مريم.خليل&001@مركزالشفاءالصحي.org",
        passwordHash,
        fullName: "مريم خليل",
        phone: "0599000201",
        role: "PATIENT"
      }
    })
  ]);

  const [clinicDoctorProfile, medicalDoctorProfile, medicalInternalDoctorProfile] = await Promise.all([
    prisma.doctorProfile.create({
      data: {
        userId: clinicDoctorUser.id,
        centerId: legacyClinic.id,
        departmentId: clinicFamilyDepartment.id,
        licenseNumber: "LIC-C001-2026-01",
        specialization: "طب الأسرة",
        yearsExperience: 9,
        bio: "متخصص في متابعة ارتفاع ضغط الدم والسكري والرعاية الأولية المستمرة."
      }
    }),
    prisma.doctorProfile.create({
      data: {
        userId: medicalDoctorUser.id,
        centerId: legacyMedicalCenter.id,
        departmentId: medicalCardiologyDepartment.id,
        licenseNumber: "LIC-M002-2026-01",
        specialization: "أمراض القلب",
        yearsExperience: 11,
        bio: "متخصصة في متابعة الذبحة الصدرية وارتفاع الضغط واضطرابات نظم القلب."
      }
    }),
    prisma.doctorProfile.create({
      data: {
        userId: medicalInternalDoctorUser.id,
        centerId: legacyMedicalCenter.id,
        departmentId: medicalInternalDepartment.id,
        licenseNumber: "LIC-M002-2026-02",
        specialization: "الطب الباطني",
        yearsExperience: 8,
        bio: "يركز على الأمراض المزمنة وخطط المتابعة الدوائية الوقائية."
      }
    })
  ]);

  const [clinicPatientProfile, medicalPatientProfile] = await Promise.all([
    prisma.patientProfile.create({
      data: {
        userId: clinicPatientUser.id,
        centerId: legacyClinic.id,
        medicalRecordNumber: "MRN-C001-2026-001",
        dateOfBirth: new Date("1988-07-10"),
        gender: "MALE",
        chronicConditions: "ارتفاع ضغط الدم، فرط شحميات الدم",
        insuranceNumber: "INS-C001-4482",
        emergencyContact: "مريم درويش - 0599000999"
      }
    }),
    prisma.patientProfile.create({
      data: {
        userId: medicalPatientUser.id,
        centerId: legacyMedicalCenter.id,
        medicalRecordNumber: "MRN-M002-2026-001",
        dateOfBirth: new Date("1995-11-21"),
        gender: "FEMALE",
        chronicConditions: "داء السكري",
        insuranceNumber: "INS-M002-2217",
        emergencyContact: "خليل مريم - 0599000222"
      }
    })
  ]);

  const [clinicSubscriptionPlan, medicalSubscriptionPlan] = await Promise.all([
    prisma.subscriptionPlan.create({
      data: {
        centerId: legacyClinic.id,
        name: "برنامج متابعة الأمراض المزمنة",
        description: "زيارات متابعة شهرية لمرضى الضغط والسكري مع خطة تذكير دوائي.",
        billingCycle: "MONTHLY",
        priceInCents: 12000,
        maxVisits: 4
      }
    }),
    prisma.subscriptionPlan.create({
      data: {
        centerId: legacyMedicalCenter.id,
        name: "باقة متابعة القلب",
        description: "متابعة سريرية شهرية واستشارة تخصصية وتقارير متابعة علاجية.",
        billingCycle: "MONTHLY",
        priceInCents: 18000,
        maxVisits: 3
      }
    })
  ]);

  const [clinicSubscription, medicalSubscription] = await Promise.all([
    prisma.subscription.create({
      data: {
        patientId: clinicPatientProfile.id,
        centerId: legacyClinic.id,
        planId: clinicSubscriptionPlan.id,
        status: "ACTIVE",
        startedAt: subDays(new Date(), 20),
        endsAt: subDays(new Date(), -10),
        autoRenew: true
      }
    }),
    prisma.subscription.create({
      data: {
        patientId: medicalPatientProfile.id,
        centerId: legacyMedicalCenter.id,
        planId: medicalSubscriptionPlan.id,
        status: "ACTIVE",
        startedAt: subDays(new Date(), 28),
        endsAt: subDays(new Date(), -2),
        autoRenew: true
      }
    })
  ]);

  await prisma.payment.createMany({
    data: [
      {
        subscriptionId: clinicSubscription.id,
        amountInCents: 12000,
        currency: "ILS",
        status: "PAID",
        method: "CARD",
        reference: "PAY-C001-202604",
        paidAt: subDays(new Date(), 18)
      },
      {
        subscriptionId: medicalSubscription.id,
        amountInCents: 18000,
        currency: "ILS",
        status: "PAID",
        method: "CARD",
        reference: "PAY-M002-202604",
        paidAt: subDays(new Date(), 25)
      }
    ]
  });

  await Promise.all([
    prisma.appointment.create({
      data: {
        centerId: legacyClinic.id,
        departmentId: clinicFamilyDepartment.id,
        patientId: clinicPatientProfile.id,
        doctorId: clinicDoctorProfile.id,
        scheduledAt: subDays(new Date(), 12),
        status: "COMPLETED",
        type: "FOLLOW_UP",
        reason: "متابعة ارتفاع ضغط الدم وتعديل الجرعة العلاجية",
        notes: "استقرت القراءات المنزلية بعد الالتزام بالعلاج وخطة تقليل الملح.",
        waitingMinutes: 18,
        attended: true
      }
    }),
    prisma.appointment.create({
      data: {
        centerId: legacyClinic.id,
        departmentId: clinicFamilyDepartment.id,
        patientId: clinicPatientProfile.id,
        doctorId: clinicDoctorProfile.id,
        scheduledAt: subDays(new Date(), -4),
        status: "CONFIRMED",
        type: "CLINIC",
        reason: "مراجعة نتائج الضغط المنزلي وتقييم الحاجة لإحالة تخصصية",
        notes: "يرجى إحضار سجل القياسات المنزلية والأدوية الحالية."
      }
    }),
    prisma.appointment.create({
      data: {
        centerId: legacyMedicalCenter.id,
        departmentId: medicalCardiologyDepartment.id,
        patientId: medicalPatientProfile.id,
        doctorId: medicalDoctorProfile.id,
        scheduledAt: subDays(new Date(), 6),
        status: "COMPLETED",
        type: "CLINIC",
        reason: "تقييم خفقان متكرر وألم صدري خفيف بعد الجهد",
        notes: "لا توجد علامات خطورة حادة، وتمت التوصية بمتابعة دهون الدم والاستمرار على الخطة الوقائية.",
        waitingMinutes: 24,
        attended: true
      }
    }),
    prisma.appointment.create({
      data: {
        centerId: legacyMedicalCenter.id,
        departmentId: medicalInternalDepartment.id,
        patientId: medicalPatientProfile.id,
        doctorId: medicalInternalDoctorProfile.id,
        scheduledAt: subDays(new Date(), -5),
        status: "SCHEDULED",
        type: "FOLLOW_UP",
        reason: "متابعة السكري والخطة الغذائية ومراجعة النتائج المخبرية",
        notes: "يفضّل الصيام 8 ساعات قبل الموعد إذا أمكن."
      }
    })
  ]);

  await prisma.referral.create({
    data: {
      fromCenterId: legacyClinic.id,
      toCenterId: legacyMedicalCenter.id,
      patientId: clinicPatientProfile.id,
      fromDoctorId: clinicDoctorProfile.id,
      toDoctorId: medicalDoctorProfile.id,
      departmentId: medicalCardiologyDepartment.id,
      status: "ACCEPTED",
      reason: "ألم صدري متكرر مع ارتفاع ضغط الدم وحاجة لتقييم قلبي تخصصي",
      notes: "يرجى إحضار جميع الأدوية الحالية ونتائج التخطيط السابقة.",
      priority: "HIGH",
      acceptedAt: subDays(new Date(), 2)
    }
  });

  const [clinicThread, medicalThread] = await Promise.all([
    prisma.messageThread.create({
      data: {
        patientId: clinicPatientProfile.id,
        doctorId: clinicDoctorProfile.id
      }
    }),
    prisma.messageThread.create({
      data: {
        patientId: medicalPatientProfile.id,
        doctorId: medicalDoctorProfile.id
      }
    })
  ]);

  await prisma.message.createMany({
    data: [
      {
        threadId: clinicThread.id,
        senderId: clinicDoctorUser.id,
        content: "أهلًا يوسف، راقب قياسات الضغط صباحًا ومساءً حتى موعد المراجعة القادم.",
        isRead: true,
        createdAt: subDays(new Date(), 3)
      },
      {
        threadId: clinicThread.id,
        senderId: clinicPatientUser.id,
        content: "تم، وسأحضر سجل القراءات والأدوية الحالية في الموعد.",
        isRead: true,
        createdAt: subDays(new Date(), 2)
      },
      {
        threadId: medicalThread.id,
        senderId: medicalDoctorUser.id,
        content: "مرحبًا مريم، نتائج الزيارة مطمئنة ونحتاج متابعة مخبرية قبل الموعد القادم.",
        isRead: true,
        createdAt: subDays(new Date(), 4)
      },
      {
        threadId: medicalThread.id,
        senderId: medicalPatientUser.id,
        content: "شكرًا دكتورة، هل أحتاج إلى إحضار نتائج السكر التراكمي الأخيرة؟",
        isRead: false,
        createdAt: subDays(new Date(), 1)
      }
    ]
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: clinicPatientUser.id,
        title: "تذكير بموعد متابعة الضغط",
        body: "لديك موعد مؤكد بعد أربعة أيام في عيادة طب الأسرة.",
        type: "APPOINTMENT"
      },
      {
        userId: clinicPatientUser.id,
        title: "تحديث حالة الإحالة",
        body: "تم قبول إحالتك إلى عيادة أمراض القلب في مركز الشفاء الصحي.",
        type: "REFERRAL"
      },
      {
        userId: clinicPatientUser.id,
        title: "رسالة من الطبيب المعالج",
        body: "وصلتك رسالة جديدة بخصوص قياسات ضغط الدم قبل الموعد القادم.",
        type: "MESSAGE"
      },
      {
        userId: medicalPatientUser.id,
        title: "ملخص الزيارة القلبية جاهز",
        body: "أضيف تقرير الزيارة القلبية الأخيرة إلى سجلك الصحي الإلكتروني.",
        type: "SYSTEM"
      },
      {
        userId: medicalPatientUser.id,
        title: "تذكير بموعد متابعة السكري",
        body: "لديك موعد متابعة مجدول خلال خمسة أيام في عيادة الطب الباطني.",
        type: "APPOINTMENT"
      },
      {
        userId: medicalPatientUser.id,
        title: "رسالة جديدة من الطبيب",
        body: "وصلتك رسالة جديدة بخصوص التحاليل المطلوبة قبل الزيارة القادمة.",
        type: "MESSAGE"
      }
    ]
  });

  console.log("اكتملت زراعة البيانات التجريبية للشبكة الصحية العربية.");
  console.log("مدير النظام المركزي: سلمى.أبوسمرة&001 / Password123!");
  console.log("مدير المركز الصحي: رنا.درويش&001 / Password123!");
  console.log("طبيب المركز الصحي: عمر.ناصر&001 / Password123!");
  console.log("موظف استقبال المركز الصحي: هبة.قاسم&001 / Password123!");
  console.log("مدير المركز الصحي: مها.خلف&001 / Password123!");
  console.log("طبيب المركز الصحي: لينا.حداد&001 / Password123!");
  console.log("موظف استقبال المركز الصحي: سامر.عودة&001 / Password123!");
  console.log("مريض المركز الصحي: يوسف.درويش&001 / Password123!");
  console.log("مريضة المركز الصحي: مريم.خليل&001 / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


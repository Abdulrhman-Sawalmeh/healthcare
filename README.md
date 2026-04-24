# شبكة الرعاية الصحية العربية

تمت إعادة تنظيم المشروع إلى ثلاثة أنظمة مستقلة مترابطة:

- `النظام المركزي`
- `المركز الصحي المتوسط`
- `المركز الصحي الصغير`

كل نظام أصبح مشروعًا مستقلًا بواجهة ويب مستقلة وواجهة برمجة مستقلة، مع بقاء التكامل بين الأنظمة مبنيًا على نموذج الإشعارات والإحالات والسجل الموحد للمرضى.

## البنية الحالية

- `apps/central-api`: واجهة برمجة النظام المركزي
- `apps/central-web`: واجهة النظام المركزي
- `apps/medium-center-api`: واجهة برمجة المركز الصحي المتوسط
- `apps/medium-center-web`: واجهة المركز الصحي المتوسط
- `apps/small-center-api`: واجهة برمجة المركز الصحي الصغير
- `apps/small-center-web`: واجهة المركز الصحي الصغير
- `apps/mobile`: مساحة العمل المحمولة القديمة وما زالت موجودة في المستودع

## الوظائف المنفذة

- سجل موحد للمرضى على مستوى الشبكة
- إحالات ذكية بين المراكز بناءً على التخصص والتوافر والضغط التشغيلي
- طوابير إشعارات ثنائية الاتجاه بين النظام المركزي والمراكز
- تشغيل محلي مستقل لكل مركز بحسب أدواره الوظيفية
- واجهات عربية كاملة مع مصطلحات طبية مناسبة وسلوك `RTL`

## المنافذ الافتراضية

- النظام المركزي:
  - API: `http://localhost:4000`
  - Web: `http://localhost:5174`
- المركز الصحي المتوسط:
  - API: `http://localhost:4100`
  - Web: `http://localhost:5175`
- المركز الصحي الصغير:
  - API: `http://localhost:4200`
  - Web: `http://localhost:5176`

## حسابات تجريبية

- مدير النظام المركزي: `central.admin / Password123!`
- مدير المركز الصحي الصغير: `manager.hussein / Password123!`
- طبيب المركز الصحي الصغير: `doctor.hussein / Password123!`
- موظف استقبال المركز الصحي الصغير: `reception.hussein / Password123!`
- مدير المركز الصحي المتوسط: `manager.shifaa / Password123!`
- طبيب المركز الصحي المتوسط: `doctor.shifaa / Password123!`
- موظف استقبال المركز الصحي المتوسط: `reception.shifaa / Password123!`
- فني مختبر المركز الصحي المتوسط: `lab.shifaa / Password123!`
- صيدلي المركز الصحي المتوسط: `pharmacy.shifaa / Password123!`
- ممرض المركز الصحي المتوسط: `nurse.shifaa / Password123!`

## التشغيل المحلي

1. ثبّت الحزم:

```bash
npm install
```

2. جهّز قاعدة البيانات في PostgreSQL ثم حدّث ملف `.env`.

3. أنشئ عميل Prisma وطبّق المخطط:

```bash
npx prisma generate --schema apps/central-api/prisma/schema.prisma
```

4. ازرع البيانات التجريبية:

```bash
npm run db:seed
```

5. شغّل الأنظمة التي تحتاجها:

```bash
npm run dev:central-api
npm run dev:central-web
npm run dev:medium-api
npm run dev:medium-web
npm run dev:small-api
npm run dev:small-web
```

## التحقق

```bash
npm run build --workspaces --if-present
```

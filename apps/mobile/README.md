# تطبيق المركز الصحي المتوسط

تطبيق Expo عربي خاص بالمركز المتوسط، ومتصل بواجهة البرمجة على المنفذ `4100`.

## التشغيل

شغل API أولاً:

```bash
npm run dev:medium-api
```

ثم شغل تطبيق الموبايل:

```bash
npm run dev:mobile
```

يمكن فتحه في:

- Android Emulator: اضغط `a` داخل Expo.
- Web: اضغط `w` داخل Expo.
- هاتف حقيقي: افتح المشروع عبر Expo Go، ثم غيّر `EXPO_PUBLIC_API_URL` إلى عنوان الجهاز المحلي، مثل:

```env
EXPO_PUBLIC_API_URL="http://192.168.0.106:4100/api"
```

يجب أن يكون الهاتف والحاسوب متصلين بالشبكة نفسها.

## الحسابات

كلمة المرور التجريبية لجميع الحسابات هي `Password123!`.

- `medium-manager`
- `medium-doctor`
- `medium-receptionist`
- `medium-nurse`
- `medium-lab`
- `medium-pharmacist`
- `medium-patient`

لا يخزن التطبيق بيانات الحساب، ويحتفظ فقط برمز الجلسة داخل `Expo SecureStore`.

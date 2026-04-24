# نظرة عامة على الواجهات البرمجية

كل نظام يملك `API` مستقلة، لكن المسارات تحتفظ ببنية موحدة.

## النظام المركزي

قاعدة المسارات: `http://localhost:4000/api`

- `POST /auth/login`
- `GET /auth/me`
- `GET /central/dashboard`
- `GET /central/centers`
- `PATCH /central/centers/:centerId/connection`
- `GET /central/patients`
- `GET /central/referrals`
- `GET /central/master-data`
- `POST /central/master-data/medicines`
- `POST /central/master-data/lab-tests`
- `POST /central/master-data/specialties`
- `GET /central/reports`
- `GET /central/notifications`
- `POST /central/process`
- `POST /central/sync-centers/:centerId`
- `GET /network/patients/search`
- `GET /network/centers/:centerId/status`

## المركز الصحي المتوسط

قاعدة المسارات: `http://localhost:4100/api`

- `POST /auth/login`
- `GET /auth/me`
- `GET /center/dashboard`
- `GET /center/patients`
- `GET /center/patients/search`
- `POST /center/patients`
- `GET /center/visits`
- `POST /center/visits`
- `GET /center/referrals`
- `POST /center/referrals/request`
- `GET /center/lab`
- `POST /center/lab/requests`
- `PATCH /center/lab/requests/:requestId`
- `GET /center/pharmacy`
- `GET /center/notifications`
- `POST /center/notifications/process`
- `POST /center/notifications/retry/:notificationId`
- `POST /network/notifications/from-center`

## المركز الصحي الصغير

قاعدة المسارات: `http://localhost:4200/api`

- `POST /auth/login`
- `GET /auth/me`
- `GET /center/dashboard`
- `GET /center/patients`
- `GET /center/patients/search`
- `POST /center/patients`
- `GET /center/visits`
- `POST /center/visits`
- `GET /center/referrals`
- `POST /center/referrals/request`
- `GET /center/notifications`
- `POST /center/notifications/process`
- `POST /center/notifications/retry/:notificationId`
- `POST /network/notifications/from-center`

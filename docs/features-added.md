# Graduation Features Added

## Implemented In This Phase

1. Digital patient QR card for local center patients.
2. Queue endpoint alias and safer queue actions.
3. Internal notification helpers and read/archive endpoints.
4. Additional audit events for QR and queue-sensitive actions.
5. Print-friendly QR card web pages for medium and small center systems.

## Main Files

- `apps/*-api/prisma/schema.prisma`
- `apps/*-api/prisma/migrations/20260615100000_add_patient_qr_token/migration.sql`
- `apps/*-api/src/services/patient-qr.ts`
- `apps/*-api/src/services/internal-notifications.ts`
- `apps/medium-center-api/src/routes/visit-workflow.ts`
- `apps/small-center-api/src/routes/visit-workflow.ts`
- `apps/*-api/src/routes/center.ts`
- `apps/medium-center-web/src/pages/PatientQrCardPage.tsx`
- `apps/small-center-web/src/pages/PatientQrCardPage.tsx`

## Testing Notes

Run migrations, then generate Prisma client for the API you are running:

```bash
npm --workspace @healthcare/medium-center-api run db:migrate
npx prisma generate --schema apps/medium-center-api/prisma/schema.prisma
```

Repeat with the small or central schema when running those APIs. This repository currently shares a root generated Prisma client, so generate for the target API before starting that API.

Verified builds:

- `npm --workspace @healthcare/medium-center-api run build`
- `npm --workspace @healthcare/small-center-api run build`
- `npm --workspace @healthcare/central-api run build`
- `npm --workspace @healthcare/medium-center-web run build`
- `npm --workspace @healthcare/small-center-web run build`

## Remaining Work

- Mobile QR display/scanning.
- Per-user center staff notification inbox model.
- Real-time notification delivery.
- More granular queue metrics dashboard cards.

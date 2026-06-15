# Digital Patient QR Card

## Scope

Implemented for medium-center and small-center web/API flows, with matching center-compatible routes in the central API.

## Data Model

`LocalPatient.qrToken` is an opaque UUID token. It is unique, regenerated on demand, and does not contain diagnoses, prescriptions, lab results, notes, passwords, or secrets.

Migration:

- `apps/medium-center-api/prisma/migrations/20260615100000_add_patient_qr_token/migration.sql`
- `apps/small-center-api/prisma/migrations/20260615100000_add_patient_qr_token/migration.sql`
- `apps/central-api/prisma/migrations/20260615100000_add_patient_qr_token/migration.sql`

## API

Center workspace endpoints:

- `GET /api/center/patients/:patientId/card`
- `GET /api/center/patients/qr/:qrToken`
- `POST /api/center/patients/:patientId/regenerate-qr`

The QR payload format is:

```text
healthcare-patient:<centerId>:<qrToken>
```

The API also accepts the raw `qrToken`.

## Web

Routes:

- `/patients/:patientId/card`
- `/patients/qr/:qrToken`

The card page supports printing and manager-only QR regeneration.

## Security Notes

- QR verification is authenticated and center-scoped.
- Cross-center QR tokens return a clear error.
- Audit events are written for view, verify, and regenerate actions.
- The QR image URL only contains the safe QR payload.

## Known Limitations

- Mobile QR card display/scanning was not added in this phase.
- QR image rendering uses a safe external QR image URL. The raw token entry flow still works if the image service is unavailable.

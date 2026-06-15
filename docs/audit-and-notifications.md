# Audit Log And Internal Notifications

## Audit Log

Existing audit logging is reused through:

```text
recordAuditLog(req, input)
```

New audit events added in this phase:

- `VIEW_PATIENT_QR_CARD`
- `VERIFY_PATIENT_QR_CARD`
- `REGENERATE_PATIENT_QR_CARD`
- `START_VISIT_STAGE`
- `CANCEL_VISIT`

Audit entries store metadata only. QR tokens are included only as operational identifiers and do not expose medical data.

## Internal Notifications

The project already has center alerts via `CenterSystemAlert`. This phase uses that table as the internal notification store.

Helper service:

```text
createInternalNotification(...)
notifyRole(...)
```

New center endpoints:

- `GET /api/center/notifications/unread-count`
- `PATCH /api/center/notifications/:notificationId/read`
- `PATCH /api/center/notifications/read-all`
- `PATCH /api/center/notifications/:notificationId/archive`

Unresolved `CenterSystemAlert` rows are treated as unread notifications. Read/archive marks them resolved without deleting history.

## Automatic Notifications

Medium center:

- New queued visit notifies nursing.
- Completed triage notifies doctors.
- Lab requests notify lab staff.
- Prescriptions notify pharmacy.
- Lab results notify doctors.

Small center:

- New queued visit notifies doctors.
- Prescriptions notify pharmacy.

## Known Limitations

- Notifications are center-wide alert records with role-targeted `alertType` metadata, not per-user notification rows for center staff.
- There is no real-time websocket delivery in this phase.

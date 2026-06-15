# Queue / Waiting Workflow

## Scope

The existing `visit-workflow` module is the queue engine. It now also mounts as:

```text
/api/center/queue
```

This keeps the existing UI stable while adding the requested queue-style API naming.

## Medium Center

Medium center has the richer workflow model:

- `VisitWorkflowTask`
- `NursingAssessment`
- `LocalVisit.workflowStatus`
- `LocalVisit.priority`
- upload and completion fields

Additional actions:

- `PATCH /api/center/queue/:visitId/start-stage`
- `PATCH /api/center/queue/:visitId/cancel`

Existing workflow actions remain available:

- `POST /api/center/queue`
- `PATCH /api/center/queue/:visitId/triage`
- `PATCH /api/center/queue/:visitId/doctor`
- `PATCH /api/center/queue/lab/:requestId/result`
- `PATCH /api/center/queue/prescriptions/:prescriptionId/dispense`
- `POST /api/center/queue/:visitId/complete`
- `POST /api/center/queue/:visitId/upload`

## Small Center

Small center uses the lighter workflow model and now has:

- `GET /api/center/queue`
- `POST /api/center/queue`
- `PATCH /api/center/queue/:visitId/doctor`
- `POST /api/center/queue/:visitId/complete`
- `PATCH /api/center/queue/:visitId/cancel`
- `POST /api/center/queue/:visitId/upload`

## Role Rules

- Reception/manager can queue visits.
- Nurse can start triage in medium center.
- Doctor can assess assigned visits.
- Lab and pharmacy actions are available where the medium workflow has lab requests or prescriptions.
- Completed/uploaded visits cannot be cancelled.

## Known Limitations

- Medium center reuses existing statuses such as `WAITING_TRIAGE` and `IN_TREATMENT` instead of adding duplicate `IN_NURSE`, `IN_LAB`, and `IN_PHARMACY` statuses.
- Small center intentionally remains simpler because its schema does not have medium-center workflow task tables.

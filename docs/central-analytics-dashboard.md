# Central Analytics Dashboard

## Overview

The central analytics dashboard adds a network-level monitoring view for the central system.
It is available in the central web app at:

- `/analytics`

The backing API endpoint is:

- `GET /api/central/analytics/dashboard`

The route is protected by the existing central API middleware:

- authenticated session required
- `workspace = central`
- `role = CENTRAL_ADMIN`

## Metrics Added

The dashboard includes:

- Overview KPIs: total patients, local patient records, visits, today's visits, active centers, pending referrals, completed referrals, failed sync operations, average waiting time, queue load, and appointments today.
- Center comparison: medium/small center visit counts, patient counts, referrals sent/received, queue load, average waiting time, completed/synced visits, pending/incomplete visits, and lab request counts.
- Visit analytics: visits over the last 7 days, monthly visits, visit type distribution, synced vs pending visits, and most common visit diagnoses.
- Referral analytics: total referrals, status breakdown, priority breakdown, acceptance rate, common referral reasons, and small-to-medium referral count when center codes are available.
- Appointment analytics: appointment statuses, appointments by date, and appointments by doctor from the legacy appointment model.
- Queue/waiting analytics: current queue load and average waiting time from center load snapshots.
- Lab analytics: lab request totals, statuses, most requested tests, daily workload, and average completion time when result dates exist.
- Pharmacy analytics: prescription totals, pending/dispensed prescriptions, most prescribed medicines, daily workload, and prescriptions by doctor when the prescription is linked to a visit doctor.
- Doctor workload: visits, completed/synced visits, lab requests, and prescriptions by center doctor.
- System health: last sync per center, connectivity status, pending/failed sync counts, recent sync errors, and recent center alerts.

## Data Sources

The endpoint aggregates existing data from:

- `CentralCenter`
- `LocalPatient`
- `UnifiedPatient`
- `LocalVisit`
- `UnifiedVisit`
- `CentralReferral`
- `Appointment`
- `LabRequestLocal`
- `LocalPrescription`
- `CenterLoadSnapshot`
- `IncomingNotification`
- `OutgoingNotification`
- `CentralNotification`
- `CommunicationLog`
- `NotificationProcessingLog`
- `CenterSystemAlert`
- `CenterUserAccount`

No database schema changes were added for this feature.

## API Filters

The dashboard endpoint accepts:

- `startDate`
- `endDate`
- `centerId`
- `departmentId`
- `doctorId`

Example:

```http
GET /api/central/analytics/dashboard?startDate=2026-06-01&endDate=2026-06-16&centerId=1
```

The frontend exposes:

- Today
- Last 7 days
- Last 30 days
- This month
- Custom date range
- All centers / one center
- Department, when available
- Doctor, when available

## Known Limitations

Some requested metrics cannot be calculated honestly from the current central schema:

- Queue stages are not stored centrally, so bottleneck stage and patients by workflow stage show an explicit unavailable state.
- Local visits do not include start/end timestamps, so average visit duration is unavailable.
- Local visits do not have a direct flag indicating that a visit came from a referral, so local-vs-referred visit analytics are unavailable.
- Network referrals do not store the sender doctor in `CentralReferral`, so referrals by doctor are unavailable from that source.
- Cancelled visits are not represented as an explicit state in `LocalVisit`; the dashboard shows pending/incomplete sync instead of inventing cancelled counts.

## How To Test

1. Start the local stack:

```bash
npm run start:local
```

2. Open the central web app:

```text
http://localhost:5174
```

3. Log in with the central demo account:

```text
central-admin / Password123!
```

4. Open `لوحة التحليلات` from the sidebar.

5. Verify:

- the page loads without console errors
- changing the date range changes the charts and KPIs
- selecting one center filters comparison and health data
- empty sections show Arabic unavailable/empty states
- no patient-sensitive notes or credentials are exposed
- `/api/central/analytics/dashboard` rejects unauthenticated requests

## Build Checks

Recommended checks:

```bash
npm --workspace @healthcare/central-api run build
npm --workspace @healthcare/central-web run build
npm --workspace @healthcare/medium-center-api run build
npm --workspace @healthcare/small-center-api run build
```

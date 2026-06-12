# Operational Incident Procedures

Date: 2026-05-20

## Severity

- Sev 1: auth down, data loss, database unavailable, security incident.
- Sev 2: core lab/breeder workflow blocked.
- Sev 3: degraded marketplace/upload flow.
- Sev 4: minor UI/reporting issue.

## Escalation

1. Confirm incident.
2. Assign owner.
3. Freeze deployment.
4. Preserve logs/artifacts.
5. Roll back or disable feature if needed.
6. Document root cause and corrective action.

## Emergency Shutdown

- Disable uploads for abuse/storage incident.
- Disable marketplace messaging for abuse.
- Roll back backend for auth/session incident.
- Restore database only for verified data corruption.


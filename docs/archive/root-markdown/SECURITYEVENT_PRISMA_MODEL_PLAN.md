# SecurityEvent Prisma Model Plan

## Goal
Persist security-relevant runtime events in a dedicated table.

## Model Added
- `SecurityEvent`
- Mapped table: `security_events`

## Stored Fields
- `type`
- `actorUserId`
- `outcome`
- `reason`
- `metadata`
- `createdAt`

## Safety
The runtime sanitizes metadata before persistence and redacts token/password/secret/cookie/authorization values.


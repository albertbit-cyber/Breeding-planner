# One Certificate Fallback Removal Report

## Decision

No certificate fallback path was removed.

## Reason

The remaining certificate fallback/local paths are still connected to local PDF generation and local certificate records. Removing them would be risky until a dedicated backend certificate artifact route exists and all callers are migrated.

## Verification

Certificate view/download E2E passed without removing broad fallback modules.


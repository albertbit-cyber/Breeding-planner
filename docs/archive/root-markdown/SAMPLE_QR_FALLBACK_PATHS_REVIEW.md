# Sample QR Fallback Paths Review

## Reviewed

- `breeding-app-lab/src/features/lab/pages/SampleIntakePage.jsx`
- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/src/features/lab/api/qrLookupHandlers.ts`
- `breeding-app-lab/src/services/lab/sampleLookupService.ts`
- QR utility parsing code
- local lab store sample paths

## Findings

- Shared-mode lookup is backed by order APIs and synthetic sample construction.
- Local sample lookup service and handlers remain active for local/fallback workflows.
- No single sample/QR fallback path is safe to remove yet.

## Future Cleanup Candidate

After dedicated backend sample/QR lookup endpoints are added and all callers migrate, the frontend synthetic lookup path can be replaced or narrowed.


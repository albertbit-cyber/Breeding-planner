# Certificate Fallback Paths Review

## Reviewed

- `breeding-app-lab/src/features/lab/api/client.ts`
- `breeding-app-lab/src/services/lab/certificateService.ts`
- `breeding-app-lab/src/utils/pdf/labCertificatePdf.ts`
- `breeding-app-lab/src/db/labStore.ts`
- order detail certificate UI

## Findings

- Current shared-mode certificate generation uses backend order/result data but frontend PDF rendering.
- Local certificate service/store paths still support local/fallback flows.
- No single certificate fallback path was clearly obsolete enough to remove safely.

## Keep For Now

- Local certificate service.
- Local certificate records in lab store.
- Shared frontend PDF rendering.

## Future Cleanup Candidate

If a backend certificate artifact route is added later, the frontend-only shared certificate rendering path can be replaced with backend artifact download/view behavior.


# Upload Validation And Scanning Plan

## Required Checks
- Enforce max file size before buffering large payloads.
- Validate MIME from file signature, not only client headers.
- Allowlist image types only.
- Strip metadata where possible.
- Generate normalized image variants.
- Compute checksum for duplicate and abuse tracking.
- Add malware scanning hook before public availability.

## Abuse Controls
- Use `marketplaceUploadLimiter`.
- Track failed upload count per user/IP.
- Quarantine rejected or suspicious uploads.

## Next Step
Add upload endpoint only after selecting local/staging storage and scan tooling.


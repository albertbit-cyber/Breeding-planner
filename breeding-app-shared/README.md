# breeding-app-shared

Prepared shared package split from the combined Breeding Planner repository.

## Contains

- Shared API config/status helpers.
- Shared API response contracts.
- Shared auth roles, legacy role normalization, and coarse permission constants.
- Genetics logic and morph alias data.
- Quick-add animal parser.
- Pairing and lab types.
- Marketplace listing summary/status types.
- Label presets, lab label sizing, and QR helper candidates.
- Subscription feature catalog and auth DTO candidates.

## Commands

```bash
npm install
npm run build
npm test
```

## Known Cleanup

- Separate React UI exports from pure backend-safe exports.
- Remove backend-only copied files or convert them into neutral contracts.
- Add package exports once final module boundaries are stable.
- Keep backend enforcement in `breeding-app-backend`; shared permissions are contracts and labels, not trust boundaries.

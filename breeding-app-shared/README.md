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

## Consumed by

`breeding-app-breeder` and `breeding-app-lab` depend on this package as
`"breeding-app-shared": "file:../breeding-app-shared"` and import TypeScript
source through the `exports` subpaths, so each app's Vite and vitest transform
it like their own code (and its `VITE_API_URL` env patch still applies):

- `breeding-app-shared/config/api`: backend URL validation; `createSharedApiConfig`
  takes an app's own dev ports and invalid-URL wording.
- `breeding-app-shared/i18n`: the ten languages, the first-visit-is-English rule
  and `bootstrapI18n`; the app passes its i18next instance, plugins and locales.

Subpath modules must stay free of runtime dependencies: an app's install does
not install this package's `node_modules`. Both apps allow this folder in
`server.fs.allow` so the dev server will serve it.

## Commands

```bash
npm install
npm run build
npm test
```

## Known Cleanup

- Separate React UI exports from pure backend-safe exports.
- Remove backend-only copied files or convert them into neutral contracts.
- Move more modules behind `exports` subpaths; marketplace and admin still carry their own i18n bootstrap.
- Keep backend enforcement in `breeding-app-backend`; shared permissions are contracts and labels, not trust boundaries.

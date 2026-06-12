# Breeder Lab Fallback Paths Review

## Backend-Backed Paths

- Order list/detail/create use backend API routes.
- Result draft/submit is backend-backed and lab/admin only.
- Sample lookup has backend coverage from earlier sample QR stage.

## Remaining Fallback/Local Paths To Keep For Now

- Cart persistence in `BatchOrderContext.jsx` uses localStorage for unsent cart state.
- Label profile/debug settings use localStorage.
- Certificate and label PDFs are generated client-side from backend data.
- Demo/dev user seeding remains in Lab utility code.
- Genetics update helpers still use local animal data where backend animal migration is incomplete.

## Cleanup Candidate

The nested duplicate folder `breeding-app-breeder/src/features/lab/components/components` was identified as safe to remove after import search and hash comparison. It duplicated the active `features/lab/components` files and no imports referenced the nested path.

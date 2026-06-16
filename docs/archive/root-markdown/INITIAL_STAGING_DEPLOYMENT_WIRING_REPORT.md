# Initial Staging Deployment Wiring Report

Date: 2026-05-20

## Recommended Wiring

- One backend API service.
- One staging PostgreSQL database.
- Separate lab and breeder frontend deployments.
- HTTPS-only public access.
- Explicit CORS origins.
- Cookie-preferred auth with credentials enabled.
- Upload storage outside the repo working tree.

## Rollback Notes

- Keep the current local branch/commit checkpoint before deployment.
- Deploy backend migrations before frontend traffic uses new routes.
- Keep Bearer fallback until all frontends are verified on cookie-preferred auth.
- Do not point staging at production data.


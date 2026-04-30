# Product And Workflow Spec Audit

## What This Document Is

This is a spec audit derived from the codebase. There is no separate formal product-spec repository in this project. The actual product behavior currently lives in the code.

## Product Scope

Breeding Planner combines breeder planning tools with a genetics-testing lab workflow.

At a high level the product includes:

- breeder animal and pairing management
- genetics planning and outcome estimation
- rack/space management
- QR and label workflows
- breeder-side lab order submission
- lab-side catalog, pricing, intake, result entry, and certificate workflows
- multi-role authentication for shared features

## Roles

| Role | Capabilities |
|---|---|
| `breeder` | Uses breeder planner, submits lab orders, views own results and certificates |
| `lab` | Works in the lab portal, processes orders, enters and submits results |
| `admin` | Full lab/admin surface, including catalog and pricing administration |

Public sign-up is breeder-focused. Lab/admin access is seeded/admin-managed rather than a public self-service flow.

## Breeder-Side Feature Inventory

The breeder surface in `App.jsx` includes these main functional areas:

- animal record management
- morph/genetics entry and display
- pair planning and breeding workflows
- project goals and suggestions
- rack, tub, and enclosure layout tracking
- labels and printable assets
- QR-related lookups and flows
- backups/export/import
- breeder profile information
- breeder-side lab order and result views

This is a broad product surface and much of it shares one component tree.

## Genetics And Advisor Features

Domain-heavy logic exists around:

- Punnett-style genetics calculations in [`src/genetics/punnett.ts`](../../src/genetics/punnett.ts)
- goal matching/scoring in [`src/goals/goal.ts`](../../src/goals/goal.ts)
- suggestion generation and flowchart logic in [`src/features/suggestions/api.ts`](../../src/features/suggestions/api.ts)

Important caveat:

- search-provider and LLM scaffolding exist
- not every integration is fully wired for production by default
- some advisor features depend on environment configuration or remain defensive/no-op without it

## Lab Portal Feature Inventory

The lab portal is reachable through hash-based routes in [`src/features/lab/LabAppShell.jsx`](../../src/features/lab/LabAppShell.jsx).

Current route groups include:

- dashboard
- incoming orders
- sample intake
- result entry
- completed tests
- admin oversight
- test catalog
- pricing logic
- order details
- developer tools

The presence of developer tools in the live shell is itself a current maintenance concern.

## Shared Lab Workflow

Typical intended shared workflow:

1. Breeder signs in
2. Breeder creates a shed-test order
3. Order is stored on the shared backend
4. Lab users review incoming work
5. Lab enters result drafts and submits final results
6. Completed results update breeder-visible data and certificates
7. Breeder can view completed outcomes on their side

This workflow is actively implemented but still sits on top of a compatibility layer that supports both local and shared paths.

## Certificate Workflow

Current certificate behavior is tied to completed lab results. The recent implementation direction in the repository is:

- result submission finalizes the order
- certificate data is generated from order/test/snake/breeder data
- certificate output is available on the breeder side

The certificate template and PDF generation live in:

- [`src/services/lab/certificateTemplate.ts`](../../src/services/lab/certificateTemplate.ts)
- [`src/utils/pdf/labCertificatePdf.ts`](../../src/utils/pdf/labCertificatePdf.ts)
- [`src/services/lab/certificateService.ts`](../../src/services/lab/certificateService.ts)

## Routing Model

The product uses custom hash routing instead of a formal router package.

Implications:

- route state is lightweight
- deep linking is possible only within the custom hash model
- route ownership is less explicit than in a conventional router setup
- navigation logic can be harder to audit because it is spread through UI state and hash parsing

## Persistence And User Expectations

The product does not have one universal persistence rule.

Breeder users may experience:

- local-only behavior for planner data
- backend-backed behavior for shared auth and lab flows
- Electron-specific persistence behavior on desktop

This matters for onboarding a new engineer because bugs can come from the boundary between those modes, not only from the screen where the bug is visible.

## Current Functional Constraints

The codebase itself shows several constraints that should be treated as part of the current product spec:

- the shared backend is required for reliable multi-device lab/auth behavior
- local and shared implementations do not yet have full feature parity
- some admin/lab actions are intentionally blocked on the shared path
- product behavior is partly defined by compatibility logic rather than a single canonical service boundary

## Implicit Spec Sources

The most useful spec sources in the repo are:

- UI text and behavior in `src/App.jsx` and `src/features/lab/**/*`
- domain services in `src/services/lab/**/*`
- tests under `src/**/*.test.*`, `tests/**/*`, and `server/src/tests/**/*`
- Prisma schema and backend service logic

There is no strong separation today between "spec", "application service", and "UI behavior". A new developer should expect to reconstruct product rules from multiple layers.

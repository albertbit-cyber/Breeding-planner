# Decisions, History, And Risks

## Important Note

Some of the decisions below are inferred from code structure, commit history, and migration patterns rather than being explicitly documented by the original author. They are still useful because they explain why the repository looks the way it does today.

## Inferred Decision History

### 1. Local-First Origins

The breeder planner appears to have started as a local-first application:

- heavy use of browser storage
- Electron persistence bridge
- large all-in-one frontend logic

This explains why a lot of business logic still lives in the frontend rather than the backend.

### 2. Packaging Came Before Full Backend Centralization

Electron and Capacitor support exist, suggesting the product prioritized "run everywhere" packaging before fully converging on a single shared backend model.

### 3. Shared Backend Was Added Later For Lab And Multi-User Needs

The newer backend, auth, and lab modules show a more modular architecture than the legacy breeder surface. This strongly suggests the shared backend was introduced to support:

- multi-device access
- roles and authentication
- lab operations
- centralized order and result workflows

### 4. Compatibility Was Chosen Over A Hard Rewrite

Instead of replacing all local behavior at once, the codebase introduced compatibility layers, especially around lab APIs. This reduced immediate rewrite cost, but it also created overlapping execution paths.

## High-Priority Risks

### Large Monolithic Frontend Surface

`src/App.jsx` is the single biggest maintainability risk in the codebase. It carries too much state and too many responsibilities.

Impact:

- harder onboarding
- harder refactoring
- weaker test isolation
- higher regression risk for seemingly small UI changes

### Split Persistence Model

The app uses local storage, Electron persistence, local lab database behavior, and shared backend state at the same time.

Impact:

- bugs can come from synchronization boundaries
- ownership of data can be unclear
- migration work is harder because there is no single truth source

### Partial Shared-Backend Parity

Not every lab or admin behavior has a complete shared-backend implementation.

Impact:

- UI affordances can mislead developers into assuming a server path exists
- features can behave differently depending on runtime mode

### Mixed JS/TS With Incomplete Type Coverage

The backend is stricter than the frontend. The most critical frontend file is not strongly typechecked.

Impact:

- refactors in active UI code are riskier than they look
- cross-module contracts are weaker in the breeder surface

### Documentation Drift

Some existing docs and environment examples no longer match the current code.

Examples:

- top-level README language count was outdated
- root `.env.example` contains old variable names
- legacy files exist beside active files with similar names

Impact:

- onboarding friction
- misleading setup steps
- wasted time debugging the wrong source

### No E2E Safety Net

The product has broad user-facing workflows but no browser E2E coverage.

Impact:

- regressions are likely to be caught manually and late
- release confidence depends heavily on ad hoc testing

## Codebase Smells Worth Calling Out

- developer tools are still present in the lab shell
- some temporary debug comments/logs remain in service code
- stale scaffolding directories remain in the repo
- the project contains multiple app files with overlapping names

None of these are catastrophic alone. Together they increase cognitive load.

## Practical Guidance For The Next Developer

Do:

- confirm whether a bug belongs to local mode, shared mode, or both before editing
- read the active frontend entry files before assuming structure from older files
- validate both frontend and backend builds after touching shared flows
- use the tests as spec hints, not just regression guards

Do not:

- assume `App.js` is the live breeder implementation
- assume all lab actions exposed in UI are fully backend-supported
- assume existing docs are current unless they match the code
- start with a large architectural rewrite before mapping data ownership

## Recommended Next Engineering Moves

Short-term:

- remove or isolate remaining dev-only lab tools
- document active environment variables in one place
- add CI that runs tests and builds on every PR

Medium-term:

- split `App.jsx` by domain ownership
- define a clear migration policy for local versus shared data
- add explicit route ownership and navigation structure

Long-term:

- converge on a single persistence strategy for shared-critical data
- move more business rules into typed domain services with strong tests
- add browser E2E coverage for the highest-value flows

## Suggested Ownership Boundaries

If another developer is joining, the cleanest initial ownership split is probably:

- Developer A: breeder core and `App.jsx` decomposition
- Developer B: lab/shared backend and API parity

Trying to own both surfaces at once without separation will slow transition down.

# Certificate Download Playwright E2E Plan

## Scenario

Use a completed seeded order and click `Download PDF` from the certificate card.

## Assertions

- Download event is emitted.
- Suggested filename matches `PH-GC-*.pdf`.
- Download stream is non-empty.
- No generated PDF file is committed.

## Safety

The test reads the download stream directly and does not save a permanent artifact into the repository.


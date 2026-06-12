# Breeder Label Download Plan

## Current Behavior

- Breeder label download uses frontend artifact generation through `getBreederAllLabelsArtifact`.
- The PDF contains shipping and sample labels using backend order/animal/test data.

## Rules

- Breeder can generate labels only for owned orders.
- Label content should not expose unrelated breeder data or internal admin fields.
- Label generation depends on available animals/tests and stable sample identifiers.

## Tests Needed

- API E2E verifies breeder can create/list orders with animals/tests.
- Future browser E2E should click "Preview Labels PDF" and "Download Labels PDF" in the breeder app and assert download metadata.

# Signavi V3 — Trusted First-Payment Authorization Design

Status: DESIGN ONLY — NOT APPROVED FOR PAYMENT EXECUTION

## 1. Objective

Define the independently verified, server-owned evidence
required before a V3 Square payment creation attempt may
ever be authorized.

This document does not grant authorization.

## 2. Existing Security Boundaries

- Store and V3 sandbox database connections remain separate.
- Store and Studio checkout channels remain distinct.
- Browser-provided clearance is never authoritative.
- Checkout reservations require server-owned identity.
- Payment creation requires atomic, durable claim ownership.
- Existing payment history must be reconciled.
- Production checkout remains disabled.
- The unconditional first-payment execution guard remains intact.

## 3. Evidence Required

An authorization review must verify:

1. Order identity and storefront ownership.
2. Server-owned reservation identity and current lock owner.
3. Exact persisted checkout amount and currency.
4. Stable checkout reference and Square idempotency identity.
5. Complete and consistent local payment history.
6. External Square payment and link history from trusted readers.
7. Pagination and query coverage sufficient for the reviewed scope.
8. Absence of conflicting Square identities or payment attempts.
9. No prior unresolved, expired, or ambiguous creation claim.
10. Freshness and validity of all evidence at the claim boundary.

Missing, stale, contradictory, or unverifiable evidence must
produce a blocked decision.

## 4. External Reconciliation Requirement

An empty Square search result does not by itself prove
that no previous payment-creation attempt occurred.

The system must not infer first-payment clearance from:

- One successful API lookup.
- An empty page of results.
- Client-provided status or authorization flags.
- Missing local records.
- An expired checkout lock.
- A previously attempted request whose outcome is unknown.

Uncertain payment outcomes require reconciliation, not
automatic payment-creation retries.

## 5. Authorization Decision

The authorization review should produce an auditable,
server-owned decision containing:

- Order and reservation identity.
- Evidence source identities and verification status.
- Decision reason and evidence timestamp.
- Explicit review eligibility or rejection.
- Immutable references to the underlying evidence.

Review eligibility is not payment authorization.

No new decision may silently convert
readyForAuthorizationReview into squareRequestAuthorized.

## 6. Atomic Claim Requirements

Before any eventual Square creation attempt:

- Re-read authoritative persisted operation state.
- Verify exact reservation owner and fencing identity.
- Reject previously claimed or ambiguous attempts.
- Atomically acquire the one permitted creation claim.
- Persist a stable idempotency identity.
- Prevent concurrent creation under another owner.
- Reconcile unknown outcomes without issuing a new creation attempt.

Square network operations must not execute inside
a MongoDB transaction.

## 7. Required Negative Tests

The future implementation must reject:

- Missing authoritative history.
- Incomplete Square pagination.
- Prior Square payment or payment link.
- Unknown outcome from an earlier creation attempt.
- Store/Sandbox ownership mismatch.
- Studio/Store checkout-channel mismatch.
- Amount, currency, or reference mismatch.
- Expired or stolen lock owner.
- Concurrent checkout attempts.
- Client-supplied authorization.
- Missing evidence reader or reader failure.
- Production execution without separate approval.

## 8. Development Stages

Stage A: Review existing decision contracts and evidence coverage.

Stage B: Implement missing read-only evidence verification
using isolated test fixtures and mocked Square readers.

Stage C: Add negative and concurrent-claim regression tests.

Stage D: Independently review reconciliation completeness,
idempotency, and persisted authorization evidence.

Stage E: Review a separate execution-integration proposal.
No activation is implied by completion of prior stages.

## 9. Explicit Non-Goals

This design phase must not:

- Remove the unconditional authorization guard.
- Enable production Square requests.
- Enable automatic payment retries.
- Write to production databases.
- Merge changes into main automatically.
- Combine Signavi Store and Signavi Studio checkout flows.

## 10. Activation Status

Trusted first-payment authorization: NOT CONNECTED.

Production V3 payment execution: DISABLED.

A separately reviewed implementation, safety evidence,
and explicit approval are required before any activation.

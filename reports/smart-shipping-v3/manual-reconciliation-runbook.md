# Smart Shipping V3 - Manual Reconciliation Runbook

## Scope

Sandbox order: `6adb60ab0856ccfc26aa57cf`

Expected amount: $1.00 USD

This runbook is documentation only. It does not authorize
payment creation, lock release, or payment-state modification.

## Current status

- Payment operation: `reconciliation_required`
- Classification: `square_lookup_required`
- Durable creation attempt: claimed
- Checkout lock: present
- Recorded Square payment link: absent
- External Square creation outcome: unknown

## Verified evidence

- Sandbox merchant and location authenticated.
- Payment-link discovery found no matching reference.
- Square order discovery found no matching reference.
- Square Payments API returned zero $1.00 payments.
- Persistent MongoDB operation remains unchanged.
- No automatic retry is authorized.

## Manual investigation

1. Preserve the original operation, checkout lock, and creation claim.
2. Review the committed reconciliation evidence report.
3. Check Square Sandbox transaction and payment-link records.
4. Escalate to Square support if the external outcome remains unknown.
5. Record independently verified findings before considering any state change.

## Prohibited actions

- Do not repeat the original Square creation attempt.
- Do not clear the creation-attempt claim.
- Do not release the original checkout lock.
- Do not mark the order paid without verified payment evidence.
- Do not treat an empty Square search as proof of failed creation.
- Do not enable production payment creation.

## Recovery requirements

Any future recovery must require:

- Authoritative evidence of the original external outcome.
- Verification of checkout reference, amount, currency, and location.
- A separately reviewed and tested recovery procedure.
- Atomic database state checks and ownership fencing.
- Explicit authorization before any payment-state mutation.

## Release decision

NO-GO for production payment creation.

This Sandbox operation remains isolated for manual reconciliation.
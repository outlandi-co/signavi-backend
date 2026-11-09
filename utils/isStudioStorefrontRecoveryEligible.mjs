import {
  authorizeStoredStorefrontRecovery
} from "./authorizeStoredStorefrontRecovery.mjs"

// Eligibility only. Never issues credentials or executes payment.
export function isStudioStorefrontRecoveryEligible({
  order,
  attemptKey,
  recoverySecret,
  requestedFingerprint,
  now = Date.now()
}) {
  if (
    !order ||
    order.storefront !== "signavi_studio" ||
    order.source !== "store" ||
    order.status !== "payment_required" ||
    order.paymentStatus !== "unpaid"
  ) {
    return false
  }

  const decision = authorizeStoredStorefrontRecovery({
    order,
    attemptKey,
    recoverySecret,
    requestedFingerprint,
    now
  })

  return decision.authorized === true
}

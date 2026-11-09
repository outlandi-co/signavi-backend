import {
  authorizeStorefrontRecovery
} from "./authorizeStorefrontRecovery.mjs"

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const DENIED = Object.freeze({
  authorized: false,
  mayRevealOrder: false,
  mayIssueGuestToken: false,
  mayCreateOrder: false,
  mayExecutePayment: false
})

const timestamp = value => {
  if (value instanceof Date) return value.getTime()

  if (typeof value === "string") {
    return Date.parse(value)
  }

  return NaN
}

// Maps proposed persisted Order fields to the isolated
// authorization policy. It does not return order data.
export function authorizeStoredStorefrontRecovery({
  order,
  attemptKey,
  recoverySecret,
  requestedFingerprint,
  now = Date.now()
}) {
  if (
    !order ||
    typeof order !== "object" ||
    !Number.isSafeInteger(now)
  ) {
    return DENIED
  }

  const created = timestamp(order.createdAt)
  const expires = timestamp(
    order.storefrontRecoveryExpiresAt
  )

  if (
    !Number.isFinite(created) ||
    !Number.isFinite(expires) ||
    expires <= created ||
    expires > created + WINDOW_MS ||
    expires <= now
  ) {
    return DENIED
  }

  return authorizeStorefrontRecovery({
    attemptKey,
    recoverySecret,
    requestedFingerprint,
    now,
    record: {
      attemptKey: order.storefrontCreationAttemptKey,
      fingerprint: order.storefrontCreationFingerprint,
      recoveryHash: order.storefrontRecoveryProofHash,
      createdAt: order.createdAt,
      source: order.source,
      status: order.status,
      paymentStatus: order.paymentStatus
    }
  })
}
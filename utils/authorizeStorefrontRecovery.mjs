import {
  parseStorefrontAttemptKey,
  classifyStorefrontAttempt
} from "./storefrontOrderIdempotency.mjs"

import {
  verifyStorefrontRecoveryProof
} from "./storefrontRecoveryProof.mjs"

const RECOVERY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

const DENIED = Object.freeze({
  authorized: false,
  mayRevealOrder: false,
  mayIssueGuestToken: false,
  mayCreateOrder: false,
  mayExecutePayment: false
})

export function authorizeStorefrontRecovery({
  attemptKey,
  recoverySecret,
  requestedFingerprint,
  record,
  now = Date.now()
}) {
  // This helper is a policy decision, NOT a credential-issuing endpoint.
  // Callers must separately enforce request throttling and replay controls.
  if (
    !record ||
    typeof record !== "object" ||
    !Number.isSafeInteger(now) ||
    !parseStorefrontAttemptKey(attemptKey) ||
    parseStorefrontAttemptKey(record.attemptKey) !==
      parseStorefrontAttemptKey(attemptKey)
  ) {
    return DENIED
  }

  if (
    classifyStorefrontAttempt({
      existingFingerprint: record.fingerprint,
      requestedFingerprint
    }) !== "same-attempt"
  ) {
    return DENIED
  }

  if (
    !verifyStorefrontRecoveryProof({
      attemptKey,
      recoverySecret,
      storedHash: record.recoveryHash
    })
  ) {
    return DENIED
  }

  const createdAt =
    record.createdAt instanceof Date
      ? record.createdAt.getTime()
      : typeof record.createdAt === "string"
        ? Date.parse(record.createdAt)
        : NaN

  if (
    !Number.isFinite(createdAt) ||
    createdAt > now ||
    now - createdAt >= RECOVERY_WINDOW_MS
  ) {
    return DENIED
  }

  if (
    record.source !== "store" ||
    record.status !== "payment_required" ||
    record.paymentStatus !== "unpaid"
  ) {
    return DENIED
  }

  // Eligibility alone never releases credentials.
  return {
    authorized: true,
    mayRevealOrder: false,
    mayIssueGuestToken: false,
    mayCreateOrder: false,
    mayExecutePayment: false
  }
}
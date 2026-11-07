import {
  parseStorefrontAttemptKey
} from "./storefrontOrderIdempotency.mjs"

import {
  fingerprintPreCatalogStorefrontOrder
} from "./storefrontPreCatalogFingerprint.mjs"

import {
  hashStorefrontRecoveryProof
} from "./storefrontRecoveryProof.mjs"

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000

// Produces metadata for a FUTURE guarded order-creation path.
// Does not access MongoDB, create orders, or issue tokens.
export function prepareStorefrontCreationAttempt({
  request,
  attemptKey,
  recoverySecret,
  now = Date.now()
}) {
  const normalizedKey = parseStorefrontAttemptKey(attemptKey)

  if (
    !normalizedKey ||
    !Number.isSafeInteger(now) ||
    now <= 0 ||
    now > Number.MAX_SAFE_INTEGER - WINDOW_MS
  ) {
    throw new Error("Invalid storefront creation attempt.")
  }

  const fingerprint =
    fingerprintPreCatalogStorefrontOrder(request)

  const recoveryHash = hashStorefrontRecoveryProof({
    attemptKey: normalizedKey,
    recoverySecret
  })

  return {
    storefrontCreationAttemptKey: normalizedKey,
    storefrontCreationFingerprint: fingerprint,
    storefrontRecoveryProofHash: recoveryHash,
    storefrontRecoveryExpiresAt: new Date(now + WINDOW_MS)
  }
}
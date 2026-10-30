import {
  resolveV3ProductionCheckoutIdentity
} from "./resolveV3ProductionCheckoutIdentity.js"

/**
 * Classifies already-fetched payment references.
 *
 * This is NOT an exhaustive Square payment-history search.
 * A nonmatch never proves that creating a payment is safe.
 * It never grants payment, retry, or lock-release authority.
 */

export function assessV3ProductionReferenceEvidence({
  orderId,
  records
} = {}) {
  const identity = resolveV3ProductionCheckoutIdentity({
    orderId
  })

  const references = Object.freeze([
    identity.squareOrderReferenceId,
    `signavi-v3-${identity.orderId}`,
    `signavi-v3-sandbox-${identity.orderId}`
  ])

  if (!Array.isArray(records)) {
    return Object.freeze({
      blocked: true,
      code: "INVALID_PAYMENT_EVIDENCE",
      matchingRecordCount: 0,
      verified: false,
      cleared: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  }

  // Any unrecognized record format is uncertain, not safe.
  let malformed = false
  let matches = 0

  for (const record of records) {
    if (
      !record ||
      typeof record !== "object" ||
      Array.isArray(record)
    ) {
      malformed = true
      continue
    }

    const reference = record.referenceId

    if (typeof reference !== "string") {
      malformed = true
      continue
    }

    if (references.includes(reference)) {
      matches += 1
    }
  }

  const code = malformed
    ? "PAYMENT_EVIDENCE_INCOMPLETE"
    : matches > 0
      ? "EXISTING_V3_REFERENCE_FOUND"
      : "NO_REFERENCE_MATCH_NOT_CLEARANCE"

  return Object.freeze({
    blocked: true,
    code,
    matchingRecordCount: matches,
    verified: false,
    cleared: false,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}
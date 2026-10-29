import {
  runV3ProductionCheckoutLinkWorkflow
} from "./runV3ProductionCheckoutLinkWorkflow.js"

import {
  buildV3ProductionPaymentLinkRequest
} from "./buildV3ProductionPaymentLinkRequest.js"

import {
  createV3ProductionSquareLinkAdapter
} from "./createV3ProductionSquareLinkAdapter.js"

const objectIdPattern = /^[0-9a-f]{24}$/

const blocked = reason => Object.freeze({
  status: "blocked",
  reason,
  retryAuthorized: false
})

/**
 * Trusted checkout orchestration.
 *
 * Injection boundaries are intentional:
 * - claimFresh must execute the real transactional claim
 * - verifyOwnership must read both durable claim records
 * - recordLink must perform durable, identity-bound recording
 *
 * This module is not an HTTP authorization boundary.
 * Do not expose its injected callbacks to browser input.
 */
export async function runV3TrustedProductionCheckoutExecutor({
  orderId,
  purchaseKey,
  owner,
  amountCents,
  locationId,
  redirectUrl,
  checkoutClient,
  claimFresh,
  verifyOwnership,
  recordLink,
  holdUncertain
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !objectIdPattern.test(id) ||
    purchaseKey !== `signavi-v3-production-purchase-${id}` ||
    typeof owner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(owner) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    return blocked("INVALID_TRUSTED_CHECKOUT_IDENTITY")
  }

  if (
    typeof claimFresh !== "function" ||
    typeof verifyOwnership !== "function" ||
    typeof recordLink !== "function" ||
    typeof holdUncertain !== "function" ||
    typeof checkoutClient?.paymentLinks?.create !== "function"
  ) {
    return blocked("TRUSTED_EXECUTOR_DEPENDENCIES_REQUIRED")
  }

  // Construct and validate the immutable request before claiming.
  // A rejected request must never consume a durable claim.
  let request
  try {
    request = buildV3ProductionPaymentLinkRequest({
      orderId: id,
      purchaseKey,
      amountCents,
      locationId,
      redirectUrl
    })
  } catch {
    return blocked("INVALID_PRODUCTION_SQUARE_REQUEST")
  }

  let freshClaim = null

  return runV3ProductionCheckoutLinkWorkflow({
    orderId: id,
    purchaseKey,
    owner,
    amountCents,

    claimAttempt: async () => {
      // A successful read of an old claim is insufficient.
      const claim = await claimFresh({
        orderId: id,
        purchaseKey,
        owner,
        amountCents
      })

      if (
        claim?.claimed !== true ||
        claim.orderId !== id ||
        claim.purchaseKey !== purchaseKey ||
        claim.owner !== owner ||
        claim.amountCents !== amountCents ||
        claim.squareIdempotencyKey !== request.idempotencyKey
      ) {
        return { claimed: false }
      }

      const verified = await verifyOwnership({
        orderId: id,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey: request.idempotencyKey
      })

      if (
        verified?.verified !== true ||
        verified.orderId !== id ||
        verified.purchaseKey !== purchaseKey ||
        verified.owner !== owner ||
        verified.amountCents !== amountCents ||
        verified.squareIdempotencyKey !== request.idempotencyKey
      ) {
        return { claimed: false }
      }

      // This marker exists only in this function invocation.
      // It is never derived from a previously persisted claim.
      freshClaim = claim

      return {
        claimed: true,
        orderId: id,
        idempotencyKey: purchaseKey,
        owner
      }
    },

    createLink: async () => {
      if (
        !freshClaim ||
        freshClaim.claimed !== true ||
        freshClaim.squareIdempotencyKey !== request.idempotencyKey
      ) {
        throw new Error("FRESH_TRANSACTIONAL_CLAIM_REQUIRED")
      }

      // Consume this invocation's handoff before the network call.
      freshClaim = null

      return createV3ProductionSquareLinkAdapter({
        checkoutClient,
        request,
        orderId: id,
        purchaseKey,
        persistedSquareIdempotencyKey: request.idempotencyKey
      })
    },

    persistLink: async evidence => {
      return recordLink({
        orderId: id,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey: request.idempotencyKey,
        ...evidence
      })
    },

    holdUncertain: async details => {
      freshClaim = null

      return holdUncertain({
        orderId: id,
        purchaseKey,
        owner,
        amountCents,
        squareIdempotencyKey: request.idempotencyKey,
        ...details
      })
    }
  })
}
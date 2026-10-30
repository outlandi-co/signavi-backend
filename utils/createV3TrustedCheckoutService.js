import { randomUUID } from "node:crypto"

import {
  runV3TrustedProductionCheckoutExecutor
} from "./runV3TrustedProductionCheckoutExecutor.js"

import {
  claimV3ProductionCheckoutTransactional
} from "./claimV3ProductionCheckoutTransactional.js"

import {
  verifyV3ProductionCheckoutOwnership
} from "./verifyV3ProductionCheckoutOwnership.js"

import {
  recordV3ProductionCheckoutLink
} from "./recordV3ProductionCheckoutLink.js"

const blocked = reason => Object.freeze({
  status: "blocked",
  reason,
  retryAuthorized: false
})

/**
 * Server-only dependency binding for V3 production checkout.
 *
 * The HTTP route must independently:
 * - authenticate and authorize the order
 * - calculate and persist the final payment total
 * - supply the configured production Square client
 *
 * This service does not authorize an HTTP request.
 */
export function createV3TrustedCheckoutService({
  Reservation,
  PaymentOperation,
  startSession,
  checkoutClient,
  locationId
} = {}) {
  if (
    typeof Reservation?.findOne !== "function" ||
    typeof Reservation?.findOneAndUpdate !== "function" ||
    typeof PaymentOperation?.findOne !== "function" ||
    typeof PaymentOperation?.findOneAndUpdate !== "function" ||
    typeof startSession !== "function" ||
    typeof checkoutClient?.paymentLinks?.create !== "function" ||
    typeof locationId !== "string" ||
    !locationId.trim()
  ) {
    throw new Error("TRUSTED_CHECKOUT_SERVICE_DEPENDENCIES_REQUIRED")
  }

  return async function executeTrustedCheckout({
    orderId,
    amountCents,
    redirectUrl
  } = {}) {
    const id = String(orderId || "").toLowerCase()

    if (
      !/^[0-9a-f]{24}$/.test(id) ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < 1
    ) {
      return blocked("INVALID_SERVER_CHECKOUT_INPUT")
    }

    const purchaseKey =
      `signavi-v3-production-purchase-${id}`

    // Generated on the server for this one execution attempt.
    const owner = `checkout:${randomUUID()}`

    return runV3TrustedProductionCheckoutExecutor({
      orderId: id,
      purchaseKey,
      owner,
      amountCents,
      locationId,
      redirectUrl,
      checkoutClient,

      claimFresh: async () =>
        claimV3ProductionCheckoutTransactional({
          Reservation,
          PaymentOperation,
          startSession,
          orderId: id,
          owner,
          amountCents
        }),

      verifyOwnership: async ({
        squareIdempotencyKey
      }) =>
        verifyV3ProductionCheckoutOwnership({
          Reservation,
          PaymentOperation,
          orderId: id,
          purchaseKey,
          owner,
          amountCents,
          squareIdempotencyKey
        }),

      recordLink: async evidence =>
        recordV3ProductionCheckoutLink({
          Reservation,
          PaymentOperation,
          orderId: id,
          owner,
          amountCents,
          paymentLinkId: evidence.paymentLinkId,
          squareOrderId: evidence.squareOrderId,
          paymentUrl: evidence.paymentUrl
        }),

      holdUncertain: async ({
        squareIdempotencyKey
      }) => {
        try {
          const [reservation, operation] = await Promise.all([
            Reservation.findOne({
              environment: "production",
              orderId: id,
              purchaseKey,
              status: "claim_pending",
              checkoutClaimOwner: owner,
              checkoutClaimAmountCents: amountCents,
              attemptClaimedAt: { $ne: null }
            }).lean(),

            PaymentOperation.findOne({
              environment: "production",
              orderId: id,
              idempotencyKey: purchaseKey,
              requestOwner: owner,
              amountCents,
              squareIdempotencyKey,
              status: "reconciliation_required",
              squareCreationAttemptClaimedAt: {
                $ne: null
              }
            }).lean()
          ])

          // A positive result confirms that the durable
          // reconciliation lock exists. No automatic retry.
          return {
            held: Boolean(reservation && operation)
          }
        } catch {
          return { held: false }
        }
      }
    })
  }
}
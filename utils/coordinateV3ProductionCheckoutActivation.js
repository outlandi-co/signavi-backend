import {
  prepareV3CheckoutPayment
} from "./smartShippingV3PaymentPreparation.js"

import {
  persistV3ProductionCheckoutAtomic
} from "./persistV3ProductionCheckoutAtomic.js"

const blocked = reason => Object.freeze({
  ready: false,
  reason,
  httpStatus: 423,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

/**
 * Production V3 checkout activation preparation.
 *
 * This module never creates Square payment links.
 *
 * A checkout must pass trusted ownership verification,
 * signed quote validation, and historical payment checks
 * before its initial payment identity can be persisted.
 */
export function createV3ProductionCheckoutActivationCoordinator({
  Order,
  Reservation,
  PaymentOperation,
  startSession,
  checkHistoricalPayment,
  acquireSharedFence
} = {}) {
  const valid =
    typeof Order?.findById === "function" &&
    typeof Reservation?.create === "function" &&
    typeof PaymentOperation?.create === "function" &&
    typeof startSession === "function" &&
    typeof checkHistoricalPayment === "function" &&
    typeof acquireSharedFence === "function"

  return async function coordinate({
    order,
    guestToken,
    signedQuote
  } = {}) {
    if (!valid) {
      return blocked("TRUSTED_DEPENDENCIES_REQUIRED")
    }

    if (
      !order ||
      !/^[0-9a-f]{24}$/.test(String(order._id || "").toLowerCase())
    ) {
      return blocked("INVALID_ORDER_ID")
    }

    const prepared = prepareV3CheckoutPayment({
      order,
      guestToken,
      signedQuote
    })

    if (!prepared) {
      return blocked("SIGNED_CHECKOUT_NOT_VERIFIED")
    }

    let history

    try {
      history = await checkHistoricalPayment({
        orderId: String(order._id).toLowerCase(),
        amountCents: prepared.totalCents
      })
    } catch {
      return blocked("HISTORICAL_PAYMENT_CHECK_UNCERTAIN")
    }

    if (
      history?.verified !== true ||
      history?.noPriorPaymentActivity !== true
    ) {
      return blocked("HISTORICAL_PAYMENT_NOT_CLEARED")
    }

    // Reserve the cross-workflow payment identity first.
    // Any uncertain outcome leaves checkout blocked.
    // Never automatically release or retry this fence.
    let fence

    try {
      fence = await acquireSharedFence({
        orderId: String(order._id).toLowerCase(),
        amountCents: prepared.totalCents
      })
    } catch {
      return blocked("SHARED_FENCE_OUTCOME_UNCERTAIN")
    }

    const id = String(order._id).toLowerCase()

    if (
      fence?.reserved !== true ||
      fence.orderId !== id ||
      fence.environment !== "production" ||
      fence.amountCents !== prepared.totalCents ||
      typeof fence.owner !== "string" ||
      !fence.owner ||
      fence.idempotencyKey !== `signavi-production-${id}`
    ) {
      return blocked("SHARED_FENCE_NOT_VERIFIED")
    }

    const persisted = await persistV3ProductionCheckoutAtomic({
      Order,
      Reservation,
      PaymentOperation,
      startSession,
      orderId: String(order._id),
      guestToken,
      signedQuote
    })

    if (
      persisted?.persistedAndVerified !== true ||
      persisted.amountCents !== prepared.totalCents
    ) {
      return blocked("ATOMIC_CHECKOUT_NOT_VERIFIED")
    }

    return Object.freeze({
      ready: true,
      orderId: persisted.orderId,
      purchaseKey: persisted.purchaseKey,
      amountCents: persisted.amountCents,
      persistedAndVerified: true,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  }
}
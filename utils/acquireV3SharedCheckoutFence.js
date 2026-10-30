import {
  acquireSquarePaymentCreationReservation
} from "./acquireSquarePaymentCreationReservation.js"

const blocked = reason => Object.freeze({
  reserved: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

/**
 * Acquires the legacy order/environment reservation identity
 * for V3 checkout.
 *
 * This is a durable ownership fence, NOT permission to
 * create a Square payment.
 *
 * Existing reservations are not reused, reset, or released.
 * Uncertain outcomes require reconciliation.
 *
 * Both payment routes must invoke this shared boundary
 * before production Square execution can be enabled.
 */
export async function acquireV3SharedCheckoutFence({
  orderId,
  amountCents
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    return blocked("INVALID_SHARED_CHECKOUT_IDENTITY")
  }

  try {
    const result = await acquireSquarePaymentCreationReservation({
      orderId: id,
      environment: "production",
      amountCents
    })

    if (
      result?.reserved !== true ||
      result?.orderId !== id ||
      result?.environment !== "production" ||
      result?.amountCents !== amountCents ||
      typeof result?.owner !== "string" ||
      !result.owner ||
      result.idempotencyKey !== `signavi-production-${id}`
    ) {
      return blocked(
        result?.reason || "SHARED_RESERVATION_NOT_VERIFIED"
      )
    }

    return Object.freeze({
      reserved: true,
      orderId: id,
      amountCents,
      environment: "production",
      owner: result.owner,
      idempotencyKey: result.idempotencyKey,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  } catch {
    return blocked("SHARED_RESERVATION_OUTCOME_UNCERTAIN")
  }
}
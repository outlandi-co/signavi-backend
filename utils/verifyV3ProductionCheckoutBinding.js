import {
  verifyV3TrustedCheckoutAmount
} from "./verifyV3TrustedCheckoutAmount.js"

const blocked = reason => Object.freeze({
  verified: false,
  reason,
  squareRequestAuthorized: false
})

export function verifyV3ProductionCheckoutBinding({
  order,
  prepared,
  reservation,
  operation
} = {}) {
  const amount = verifyV3TrustedCheckoutAmount({
    order,
    prepared
  })

  if (!amount.verified) {
    return blocked(amount.reason)
  }

  const orderId = String(order._id).toLowerCase()
  const purchaseKey =
    `signavi-v3-production-purchase-${orderId}`

  if (
    order.squareEnvironment !== "production" ||
    order.squareExpectedAmountCents !== prepared.totalCents
  ) {
    return blocked("PRODUCTION_ORDER_AMOUNT_NOT_BOUND")
  }

  if (
    !reservation ||
    reservation.environment !== "production" ||
    String(reservation.orderId).toLowerCase() !== orderId ||
    reservation.purchaseKey !== purchaseKey ||
    reservation.idempotencyKey !== purchaseKey ||
    reservation.claimedByDocumentType !== "order" ||
    String(reservation.claimedByDocumentId).toLowerCase() !== orderId ||
    reservation.status !== "reserved" ||
    reservation.attemptClaimedAt != null ||
    reservation.checkoutClaimOwner ||
    reservation.checkoutClaimAmountCents != null
  ) {
    return blocked("PRODUCTION_RESERVATION_MISMATCH")
  }

  if (
    !operation ||
    operation.environment !== "production" ||
    String(operation.orderId).toLowerCase() !== orderId ||
    operation.idempotencyKey !== purchaseKey ||
    operation.amountCents !== prepared.totalCents ||
    operation.status !== "pending" ||
    operation.squareCreationAttemptClaimedAt != null ||
    operation.requestOwner ||
    operation.squareIdempotencyKey ||
    operation.squarePaymentLinkId ||
    operation.squareOrderId ||
    operation.paymentUrl
  ) {
    return blocked("PRODUCTION_OPERATION_MISMATCH")
  }

  return Object.freeze({
    verified: true,
    orderId,
    purchaseKey,
    amountCents: prepared.totalCents,
    squareRequestAuthorized: false
  })
}
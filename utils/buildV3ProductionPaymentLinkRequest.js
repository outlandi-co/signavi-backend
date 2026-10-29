import { createHash } from "node:crypto"

const ORDER_ID = /^[0-9a-f]{24}$/
const LOCATION_ID = /^[A-Za-z0-9_-]{1,100}$/

export function buildV3ProductionPaymentLinkRequest({
  orderId,
  purchaseKey,
  amountCents,
  locationId,
  redirectUrl
} = {}) {
  if (
    typeof orderId !== "string" ||
    !ORDER_ID.test(orderId)
  ) {
    throw new Error("INVALID_PRODUCTION_ORDER_ID")
  }

  const expectedPurchaseKey =
    `signavi-v3-production-purchase-${orderId}`

  if (purchaseKey !== expectedPurchaseKey) {
    throw new Error("PRODUCTION_PURCHASE_IDENTITY_MISMATCH")
  }

  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("INVALID_PRODUCTION_PAYMENT_AMOUNT")
  }

  if (
    typeof locationId !== "string" ||
    !LOCATION_ID.test(locationId)
  ) {
    throw new Error("INVALID_PRODUCTION_LOCATION")
  }

  if (typeof redirectUrl !== "string") {
    throw new Error("INVALID_PRODUCTION_REDIRECT")
  }

  const expectedRedirect =
    `https://signavi.store/success/${orderId}`

  if (redirectUrl !== expectedRedirect) {
    throw new Error("UNTRUSTED_PRODUCTION_REDIRECT")
  }

  // Square payment-link idempotency keys have a
  // 45-character maximum. Derive a stable, scoped key.
  // This key must be persisted and verified by the
  // future trusted executor before any API request.
  const digest = createHash("sha256")
    .update(`square-link:production:${purchaseKey}`)
    .digest("hex")
    .slice(0, 40)

  const squareIdempotencyKey = `sv3p-${digest}`

  const referenceId = `SV3-${orderId}`

  return Object.freeze({
    idempotencyKey: squareIdempotencyKey,
    order: {
      locationId,
      referenceId,
      note: `SignaVi V3 Production Order ${orderId}`,
      lineItems: [{
        name: `SignaVi Order ${orderId}`,
        quantity: "1",
        basePriceMoney: {
          amount: BigInt(amountCents),
          currency: "USD"
        }
      }]
    },
    checkoutOptions: {
      redirectUrl,
      askForShippingAddress: false
    }
  })
}
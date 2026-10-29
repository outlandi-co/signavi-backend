import { createHash } from "node:crypto"

/**
 * Square transport adapter, NOT an execution authorizer.
 *
 * Never call directly from an HTTP route.
 * A future trusted executor must first acquire and verify
 * the fresh one-time database claim.
 *
 * No retry, including after an ambiguous Square response.
 */
export async function createV3ProductionSquareLinkAdapter({
  checkoutClient,
  request,
  orderId,
  purchaseKey,
  persistedSquareIdempotencyKey
} = {}) {
  const id = String(orderId || "").toLowerCase()
  const expectedPurchaseKey =
    `signavi-v3-production-purchase-${id}`

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    purchaseKey !== expectedPurchaseKey
  ) {
    throw new Error("INVALID_SQUARE_ADAPTER_IDENTITY")
  }

  const expectedSquareKey =
    `sv3p-${createHash("sha256")
      .update(`square-link:production:${purchaseKey}`)
      .digest("hex")
      .slice(0, 40)}`

  if (
    persistedSquareIdempotencyKey !== expectedSquareKey ||
    request?.idempotencyKey !== expectedSquareKey
  ) {
    throw new Error("SQUARE_REQUEST_IDENTITY_MISMATCH")
  }

  if (
    !request?.order ||
    !request?.checkoutOptions ||
    typeof checkoutClient?.paymentLinks?.create !== "function"
  ) {
    throw new Error("TRUSTED_SQUARE_TRANSPORT_REQUIRED")
  }

  // The caller owns authorization and freshness validation.
  // Exactly one SDK invocation. No application-level retries.
  const response = await checkoutClient.paymentLinks.create(
    request,
    { maxRetries: 0 }
  )

  const paymentLink = response?.paymentLink

  const paymentLinkId = paymentLink?.id
  const squareOrderId =
    paymentLink?.orderId || paymentLink?.order_id
  const paymentUrl = paymentLink?.url

  if (
    typeof paymentLinkId !== "string" ||
    !paymentLinkId.trim() ||
    typeof squareOrderId !== "string" ||
    !squareOrderId.trim() ||
    typeof paymentUrl !== "string" ||
    !/^https:\/\//i.test(paymentUrl)
  ) {
    throw new Error("SQUARE_LINK_EVIDENCE_INCOMPLETE")
  }

  return Object.freeze({
    paymentLinkId,
    squareOrderId,
    paymentUrl
  })
}
import { createHash } from "node:crypto"

const blocked = reason => Object.freeze({
  verified: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

export async function verifyV3ProductionCheckoutOwnership({
  Reservation,
  PaymentOperation,
  orderId,
  owner,
  amountCents
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !/^[a-f0-9]{24}$/.test(id) ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(String(owner || "")) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    return blocked("INVALID_CHECKOUT_IDENTITY")
  }

  if (
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.findOne !== "function"
  ) {
    return blocked("TRUSTED_REPOSITORIES_REQUIRED")
  }

  const purchaseKey = `signavi-v3-production-purchase-${id}`

  const squareIdempotencyKey =
    `sv3p-${createHash("sha256")
      .update(`square-link:production:${purchaseKey}`)
      .digest("hex")
      .slice(0, 40)}`

  let reservation
  let operation

  try {
    ;[reservation, operation] = await Promise.all([
      Reservation.findOne({
        environment: "production",
        orderId: id,
        purchaseKey,
        idempotencyKey: purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        status: "claim_pending",
        checkoutClaimOwner: owner,
        checkoutClaimAmountCents: amountCents,
        attemptClaimedAt: { $ne: null }
      }).lean(),
      PaymentOperation.findOne({
        environment: "production",
        orderId: id,
        idempotencyKey: purchaseKey,
        amountCents,
        status: "reconciliation_required",
        requestOwner: owner,
        squareIdempotencyKey,
        squareCreationAttemptClaimedAt: { $ne: null },
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      }).lean()
    ])
  } catch {
    return blocked("DURABLE_OWNERSHIP_READ_UNCERTAIN")
  }

  if (!reservation || !operation) {
    return blocked("DURABLE_OWNERSHIP_NOT_FOUND")
  }

  if (
    String(reservation.orderId).toLowerCase() !== id ||
    reservation.purchaseKey !== purchaseKey ||
    reservation.idempotencyKey !== purchaseKey ||
    reservation.status !== "claim_pending" ||
    reservation.checkoutClaimOwner !== owner ||
    reservation.checkoutClaimAmountCents !== amountCents ||
    !reservation.attemptClaimedAt ||
    String(operation.orderId).toLowerCase() !== id ||
    operation.idempotencyKey !== purchaseKey ||
    operation.status !== "reconciliation_required" ||
    operation.requestOwner !== owner ||
    operation.amountCents !== amountCents ||
    operation.squareIdempotencyKey !== squareIdempotencyKey ||
    !operation.squareCreationAttemptClaimedAt ||
    operation.squarePaymentLinkId !== "" ||
    operation.squareOrderId !== "" ||
    operation.paymentUrl !== ""
  ) {
    return blocked("DURABLE_OWNERSHIP_MISMATCH")
  }

  return Object.freeze({
    verified: true,
    orderId: id,
    purchaseKey,
    squareIdempotencyKey,
    owner,
    amountCents,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}
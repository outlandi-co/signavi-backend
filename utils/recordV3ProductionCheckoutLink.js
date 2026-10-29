import { createHash } from "node:crypto"
const validId = value => /^[0-9a-f]{24}$/.test(String(value || ""))

const blocked = reason => Object.freeze({
  recorded: false,
  reason,
  squareCreationAuthorized: false,
  retryAuthorized: false
})

/**
 * Records a returned Square payment link exactly once.
 * This is NOT payment completion and does not enable Square.
 *
 * The claim must already have been durably coordinated.
 * A lost database acknowledgement remains uncertain.
 */
export async function recordV3ProductionCheckoutLink({
  Reservation,
  PaymentOperation,
  orderId,
  owner,
  amountCents,
  paymentLinkId,
  squareOrderId,
  paymentUrl
} = {}) {
  const id = String(orderId || "").toLowerCase()
  const key = `signavi-v3-production-purchase-${id}`

  const squareIdempotencyKey =
    `sv3p-${createHash("sha256")
      .update(`square-link:production:${key}`)
      .digest("hex")
      .slice(0, 40)}`

  if (
    !validId(id) ||
    typeof owner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(owner) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    typeof paymentLinkId !== "string" ||
    !paymentLinkId.trim() ||
    typeof squareOrderId !== "string" ||
    !squareOrderId.trim() ||
    typeof paymentUrl !== "string" ||
    !/^https:\/\/[^/\s?#]+(?:[/?#]|$)/i.test(paymentUrl)
  ) {
    return blocked("INVALID_LINK_RECORDING_IDENTITY")
  }

  if (
    typeof Reservation?.findOne !== "function" ||
    typeof PaymentOperation?.findOneAndUpdate !== "function"
  ) {
    return blocked("TRUSTED_REPOSITORIES_REQUIRED")
  }

  let reservation
  try {
    reservation = await Reservation.findOne({
      environment: "production",
      orderId: id,
      purchaseKey: key,
      idempotencyKey: key,
      claimedByDocumentType: "order",
      claimedByDocumentId: id,
      status: "claim_pending",
      checkoutClaimOwner: owner,
      checkoutClaimAmountCents: amountCents,
      attemptClaimedAt: { $ne: null }
    }).lean()
  } catch {
    return blocked("RESERVATION_READ_UNCERTAIN")
  }

  if (
    !reservation ||
    String(reservation.orderId).toLowerCase() !== id ||
    reservation.purchaseKey !== key ||
    reservation.idempotencyKey !== key ||
    reservation.status !== "claim_pending" ||
    reservation.checkoutClaimOwner !== owner ||
    reservation.checkoutClaimAmountCents !== amountCents ||
    !reservation.attemptClaimedAt
  ) {
    return blocked("DURABLE_RESERVATION_CLAIM_REQUIRED")
  }

  let operation
  try {
    operation = await PaymentOperation.findOneAndUpdate(
      {
        environment: "production",
        orderId: id,
        idempotencyKey: key,
        squareIdempotencyKey,
        requestOwner: owner,
        amountCents,
        status: "reconciliation_required",
        squareCreationAttemptClaimedAt: { $ne: null },
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      },
      {
        $set: {
          squarePaymentLinkId: paymentLinkId,
          squareOrderId,
          paymentUrl
        }
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    )
  } catch {
    return blocked("LINK_RECORDING_OUTCOME_UNCERTAIN")
  }

  if (
    !operation ||
    String(operation.orderId).toLowerCase() !== id ||
    operation.idempotencyKey !== key ||
    operation.squareIdempotencyKey !== squareIdempotencyKey ||
    operation.requestOwner !== owner ||
    operation.status !== "reconciliation_required" ||
    operation.squarePaymentLinkId !== paymentLinkId ||
    operation.squareOrderId !== squareOrderId ||
    operation.paymentUrl !== paymentUrl ||
    !operation.squareCreationAttemptClaimedAt
  ) {
    return blocked("LINK_RECORDING_NOT_CONFIRMED")
  }

  // The operation intentionally remains reconciliation_required.
  // A checkout link is NOT evidence of completed payment.
  return Object.freeze({
    recorded: true,
    reason: "CHECKOUT_LINK_RECORDED",
    squareCreationAuthorized: false,
    retryAuthorized: false
  })
}
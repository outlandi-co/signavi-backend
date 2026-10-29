/**
 * Atomic production reservation claim.
 *
 * This claims only the reservation document.
 * It does NOT authorize a Square call.
 *
 * Before production integration, the payment operation
 * must also be validated and coordinated atomically.
 */
export async function claimV3ProductionCheckoutReservation({
  Reservation,
  orderId,
  owner,
  amountCents
} = {}) {
  const id = String(orderId || "").toLowerCase()
  const key = `signavi-v3-production-purchase-${id}`

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    typeof owner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(owner) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    throw new Error("INVALID_CHECKOUT_CLAIM_IDENTITY")
  }

  if (typeof Reservation?.findOneAndUpdate !== "function") {
    throw new Error("TRUSTED_RESERVATION_MODEL_REQUIRED")
  }

  const claimedAt = new Date()

  // Only an unclaimed reservation belonging to this order
  // can transition to claim_pending. Existing claims, uncertain
  // attempts, and completed purchases cannot be reclaimed.
  const reservation = await Reservation.findOneAndUpdate(
    {
      environment: "production",
      orderId: id,
      purchaseKey: key,
      idempotencyKey: key,
      claimedByDocumentType: "order",
      claimedByDocumentId: id,
      status: "reserved",
      attemptClaimedAt: null,
      checkoutClaimOwner: null
    },
    {
      $set: {
        status: "claim_pending",
        attemptClaimedAt: claimedAt,
        checkoutClaimOwner: owner,
        checkoutClaimAmountCents: amountCents
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!reservation) {
    return Object.freeze({
      claimed: false,
      blocked: true,
      reason: "RESERVATION_ALREADY_CLAIMED_OR_UNAVAILABLE"
    })
  }

  if (
    String(reservation.orderId).toLowerCase() !== id ||
    reservation.purchaseKey !== key ||
    reservation.idempotencyKey !== key ||
    reservation.status !== "claim_pending" ||
    reservation.checkoutClaimOwner !== owner ||
    reservation.checkoutClaimAmountCents !== amountCents ||
    !reservation.attemptClaimedAt
  ) {
    // This cannot grant permission even if the database
    // acknowledgment or returned document is inconsistent.
    throw new Error("CHECKOUT_CLAIM_RESULT_UNCERTAIN")
  }

  return Object.freeze({
    claimed: true,
    blocked: false,
    orderId: id,
    purchaseKey: key,
    idempotencyKey: key,
    owner,
    amountCents
  })
}
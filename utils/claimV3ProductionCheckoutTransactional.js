import { createHash } from "node:crypto"

const blocked = reason => Object.freeze({
  claimed: false,
  reason,
  squareRequestAuthorized: false,
  retryAuthorized: false
})

export async function claimV3ProductionCheckoutTransactional({
  Reservation,
  PaymentOperation,
  startSession,
  orderId,
  owner,
  amountCents
} = {}) {
  const id = String(orderId || "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(String(owner || "")) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1
  ) {
    return blocked("INVALID_CHECKOUT_IDENTITY")
  }

  if (
    typeof Reservation?.findOneAndUpdate !== "function" ||
    typeof PaymentOperation?.findOneAndUpdate !== "function" ||
    typeof startSession !== "function"
  ) {
    return blocked("TRUSTED_TRANSACTION_DEPENDENCIES_REQUIRED")
  }

  const purchaseKey =
    `signavi-v3-production-purchase-${id}`

  const squareIdempotencyKey =
    `sv3p-${createHash("sha256")
      .update(`square-link:production:${purchaseKey}`)
      .digest("hex")
      .slice(0, 40)}`

  let session
  let committed = false
  let claimed = false

  try {
    session = await startSession()
    session.startTransaction()

    // Claim both documents inside one transaction.
    // No Square call is permitted in this transaction.
    const operation = await PaymentOperation.findOneAndUpdate(
      {
        environment: "production",
        orderId: id,
        idempotencyKey: purchaseKey,
        amountCents,
        status: "pending",
        squareCreationAttemptClaimedAt: null,
        squareIdempotencyKey: null,
        squarePaymentLinkId: "",
        squareOrderId: "",
        paymentUrl: ""
      },
      {
        $set: {
          status: "reconciliation_required",
          requestOwner: owner,
          squareIdempotencyKey,
          squareCreationAttemptClaimedAt: new Date(),
          lastError: "Checkout claimed; Square execution pending."
        }
      },
      {
        session,
        returnDocument: "after",
        runValidators: true
      }
    )

    if (
      !operation ||
      operation.requestOwner !== owner ||
      operation.squareIdempotencyKey !== squareIdempotencyKey ||
      operation.status !== "reconciliation_required"
    ) {
      await session.abortTransaction()
      return blocked("PAYMENT_OPERATION_CLAIM_UNAVAILABLE")
    }

    const reservation = await Reservation.findOneAndUpdate(
      {
        environment: "production",
        orderId: id,
        purchaseKey,
        idempotencyKey: purchaseKey,
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        status: "reserved",
        attemptClaimedAt: null
      },
      {
        $set: {
          status: "claim_pending",
          attemptClaimedAt: new Date(),
          checkoutClaimOwner: owner,
          checkoutClaimAmountCents: amountCents
        }
      },
      {
        session,
        returnDocument: "after",
        runValidators: true
      }
    )

    if (
      !reservation ||
      reservation.checkoutClaimOwner !== owner ||
      reservation.checkoutClaimAmountCents !== amountCents ||
      reservation.status !== "claim_pending"
    ) {
      await session.abortTransaction()
      return blocked("PURCHASE_RESERVATION_CLAIM_UNAVAILABLE")
    }

    claimed = true

    // Explicit single commit attempt. No automatic retry.
    await session.commitTransaction()
    committed = true

  } catch {
    if (session?.inTransaction()) {
      try {
        await session.abortTransaction()
      } catch {
        // Keep the outcome uncertain.
      }
    }

    return blocked(
      claimed
        ? "TRANSACTION_COMMIT_OUTCOME_UNCERTAIN"
        : "TRANSACTION_CLAIM_FAILED"
    )
  } finally {
    if (session) {
      await session.endSession()
    }
  }

  if (!committed) {
    return blocked("TRANSACTION_NOT_CONFIRMED")
  }

  // A committed claim is NOT authority to send a Square request.
  // The future executor must additionally verify execution freshness.
  return Object.freeze({
    claimed: true,
    orderId: id,
    purchaseKey,
    squareIdempotencyKey,
    owner,
    amountCents,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}
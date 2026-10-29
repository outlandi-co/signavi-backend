import { createHash } from "node:crypto"

export async function claimV3ProductionSquareIdentityIsolated({
  PaymentOperation,
  orderId,
  amountCents,
  owner
} = {}) {
  // This helper is restricted to isolated testing.
  // It never authorizes or calls Square.
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  const id = String(orderId || "").toLowerCase()

  if (
    !/^[0-9a-f]{24}$/.test(id) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 1 ||
    typeof owner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(owner) ||
    typeof PaymentOperation?.findOneAndUpdate !== "function"
  ) {
    throw new Error("INVALID_ATOMIC_CLAIM_INPUT")
  }

  const purchaseKey =
    `signavi-v3-production-purchase-${id}`

  const squareIdempotencyKey =
    `sv3p-${createHash("sha256")
      .update(`square-link:production:${purchaseKey}`)
      .digest("hex")
      .slice(0, 40)}`

  const blocked = reason => Object.freeze({
    claimed: false,
    blocked: true,
    reason,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })

  // One atomic compare-and-set operation.
  // No external Square call occurs here.
  const claimed = await PaymentOperation.findOneAndUpdate(
    {
      orderId: id,
      environment: "production",
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
        squareIdempotencyKey,
        requestOwner: owner,
        squareCreationAttemptClaimedAt: new Date(),
        status: "reconciliation_required",
        lastError: "Square identity reserved; execution disabled."
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!claimed) {
    return blocked("ATOMIC_CLAIM_NOT_AVAILABLE")
  }

  if (
    claimed.squareIdempotencyKey !== squareIdempotencyKey ||
    claimed.requestOwner !== owner ||
    claimed.amountCents !== amountCents ||
    claimed.status !== "reconciliation_required" ||
    !claimed.squareCreationAttemptClaimedAt
  ) {
    throw new Error("ATOMIC_CLAIM_RESULT_UNCERTAIN")
  }

  return Object.freeze({
    claimed: true,
    blocked: false,
    orderId: id,
    owner,
    purchaseKey,
    squareIdempotencyKey,
    squareRequestAuthorized: false,
    retryAuthorized: false
  })
}
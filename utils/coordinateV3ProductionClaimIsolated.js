import { createHash } from "node:crypto"
import {
  verifyV3ProductionPaymentAlignment
} from "./verifyV3ProductionPaymentAlignment.js"

export async function coordinateV3ProductionClaimIsolated({
  orderId,
  Reservation,
  PaymentOperation,
  afterOperationClaim, checkoutOwner, checkoutAmountCents
}) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("ISOLATED_TEST_ONLY")
  }

  if (
    !Reservation?.findOne ||
    !Reservation?.findOneAndUpdate ||
    !PaymentOperation?.findOne ||
    !PaymentOperation?.findOneAndUpdate
  ) {
    throw new Error("TRUSTED_REPOSITORIES_REQUIRED")
  }

  const id = String(orderId ?? "").toLowerCase()

  if (!/^[0-9a-f]{24}$/.test(id)) {
    throw new Error("INVALID_ORDER_ID")
  }

  const checkoutRequested =
    checkoutOwner !== undefined ||
    checkoutAmountCents !== undefined

  if (checkoutRequested && (
    typeof checkoutOwner !== "string" ||
    !/^[a-zA-Z0-9:_-]{8,128}$/.test(checkoutOwner) ||
    !Number.isSafeInteger(checkoutAmountCents) ||
    checkoutAmountCents < 1
  )) {
    throw new Error("INVALID_CHECKOUT_CLAIM_INPUT")
  }
  const purchaseKey = `signavi-v3-production-purchase-${id}`

  const squareIdempotencyKey = checkoutRequested
    ? `sv3p-${createHash("sha256")
        .update(`square-link:production:${purchaseKey}`)
        .digest("hex")
        .slice(0, 40)}`
    : null

  const [reservation, operation] = await Promise.all([
    Reservation.findOne({
      orderId: id,
      environment: "production",
      purchaseKey
    }),
    PaymentOperation.findOne({
      orderId: id,
      environment: "production",
      idempotencyKey: purchaseKey
    })
  ])

  const alignment = verifyV3ProductionPaymentAlignment({
    reservation,
    operation
  })

  const blocked = reason => Object.freeze({
    coordinated: false,
    blocked: true,
    reason,
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false
  })

  if (!alignment.aligned || alignment.state !== "unclaimed") {
    return blocked(alignment.reason)
  }

  if (
    checkoutRequested &&
    operation?.amountCents !== checkoutAmountCents
  ) {
    return blocked("CHECKOUT_AMOUNT_MISMATCH")
  }
  // Operation-first CAS. Once claimed, the operation remains
  // reconciliation_required even if the next step fails.
  const operationClaim = await PaymentOperation.findOneAndUpdate(
    {
      _id: operation._id,
      environment: "production",
      orderId: id,
      idempotencyKey: purchaseKey,
      status: "pending",
      squareCreationAttemptClaimedAt: null,
      ...(checkoutRequested ? { squareIdempotencyKey: null } : {}),
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    },
    {
      $set: {
        status: "reconciliation_required",
        squareCreationAttemptClaimedAt: new Date(),
        lastError: "Production coordinated claim; Square not called.",
        ...(checkoutRequested ? {
          requestOwner: checkoutOwner,
          squareIdempotencyKey
        } : {})
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!operationClaim) {
    return blocked("OPERATION_ALREADY_CLAIMED")
  }

  if (
    checkoutRequested &&
    (
      operationClaim.squareIdempotencyKey !== squareIdempotencyKey ||
      operationClaim.requestOwner !== checkoutOwner ||
      operationClaim.amountCents !== checkoutAmountCents ||
      operationClaim.status !== "reconciliation_required" ||
      !operationClaim.squareCreationAttemptClaimedAt
    )
  ) {
    throw new Error("SQUARE_IDENTITY_BINDING_UNCERTAIN")
  }
  if (typeof afterOperationClaim === "function") {
    // Test-only interruption injection.
    await afterOperationClaim()
  }

  const reservationClaim = await Reservation.findOneAndUpdate(
    {
      _id: reservation._id,
      environment: "production",
      orderId: id,
      purchaseKey,
      idempotencyKey: purchaseKey,
      status: "reserved",
      attemptClaimedAt: null
    },
    {
      $set: {
        status: "claim_pending",
        attemptClaimedAt: new Date(), ...(checkoutRequested ? { checkoutClaimOwner: checkoutOwner, checkoutClaimAmountCents: checkoutAmountCents } : {})
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  if (!reservationClaim) {
    return blocked("RESERVATION_NOT_CLAIMABLE")
  }

  if (
    checkoutRequested &&
    (
      reservationClaim.checkoutClaimOwner !== checkoutOwner ||
      reservationClaim.checkoutClaimAmountCents !== checkoutAmountCents
    )
  ) {
    throw new Error("CHECKOUT_CLAIM_OWNERSHIP_UNCERTAIN")
  }
  return Object.freeze({
    coordinated: true,
    blocked: false,
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false
  })
}

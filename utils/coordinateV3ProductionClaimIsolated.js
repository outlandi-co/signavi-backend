import {
  verifyV3ProductionPaymentAlignment
} from "./verifyV3ProductionPaymentAlignment.js"

export async function coordinateV3ProductionClaimIsolated({
  orderId,
  Reservation,
  PaymentOperation,
  afterOperationClaim
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

  const purchaseKey = `signavi-v3-production-purchase-${id}`

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
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: ""
    },
    {
      $set: {
        status: "reconciliation_required",
        squareCreationAttemptClaimedAt: new Date(),
        lastError: "Production coordinated claim; Square not called."
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
        attemptClaimedAt: new Date()
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

  return Object.freeze({
    coordinated: true,
    blocked: false,
    purchaseKey,
    squareCreationAuthorized: false,
    retryAuthorized: false
  })
}

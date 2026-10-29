import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const { default: Reservation } = await import(
  "../models/SmartShippingV3ProductionPurchaseReservation.js"
)

const { default: PaymentOperation } = await import(
  "../models/SmartShippingV3PaymentOperation.js"
)

const { coordinateV3ProductionClaimIsolated } = await import(
  "../utils/coordinateV3ProductionClaimIsolated.js"
)

const amountCents = 2500

const purchaseKeyFor = id =>
  `signavi-v3-production-purchase-${id}`

const squareKeyFor = id =>
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${purchaseKeyFor(id)}`)
    .digest("hex")
    .slice(0, 40)}`

async function createPair(orderId) {
  const purchaseKey = purchaseKeyFor(orderId)

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "reserved",
    attemptClaimedAt: null,
    checkoutClaimOwner: null,
    checkoutClaimAmountCents: null
  })

  await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    amountCents,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })
}

const context = orderId => ({
  orderId,
  Reservation,
  PaymentOperation
})

let server

try {
  server = await MongoMemoryServer.create()

  await mongoose.connect(server.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  console.log("PASS: Isolated MongoDB connected")

  const orderId = "507f1f77bcf86cd799439011"
  await createPair(orderId)

  // 50 different owners compete for the same purchase.
  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      coordinateV3ProductionClaimIsolated({
        ...context(orderId),
        checkoutOwner:
          `checkout-owner-${String(index).padStart(3, "0")}`,
        checkoutAmountCents: amountCents
      })
    )
  )

  const winners = attempts.filter(x => x.coordinated === true)
  const blocked = attempts.filter(x => x.blocked === true)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  console.log("PASS: 1 coordinated winner, 49 blocked")

  const reservation = await Reservation.findOne({ orderId }).lean()
  const operation = await PaymentOperation.findOne({ orderId }).lean()

  assert.ok(reservation)
  assert.ok(operation)

  const validOwners = new Set(
    Array.from(
      { length: 50 },
      (_, index) =>
        `checkout-owner-${String(index).padStart(3, "0")}`
    )
  )

  assert.ok(validOwners.has(reservation.checkoutClaimOwner))
  assert.equal(reservation.checkoutClaimAmountCents, amountCents)
  assert.equal(reservation.status, "claim_pending")
  assert.ok(reservation.attemptClaimedAt)

  assert.equal(
    operation.requestOwner,
    reservation.checkoutClaimOwner
  )

  assert.equal(operation.squareIdempotencyKey, squareKeyFor(orderId))
  assert.equal(operation.amountCents, amountCents)
  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.squareCreationAttemptClaimedAt)

  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")

  console.log("PASS: Same checkout owner stored in both records")
  console.log("PASS: Deterministic Square identity persisted")
  console.log("PASS: Both claim states persisted")
  console.log("PASS: No payment link created")

  const replay = await coordinateV3ProductionClaimIsolated({
    ...context(orderId),
    checkoutOwner: reservation.checkoutClaimOwner,
    checkoutAmountCents: amountCents
  })

  assert.equal(replay.blocked, true)
  assert.equal(replay.squareCreationAuthorized, false)
  assert.equal(replay.retryAuthorized, false)

  const competingReplay = await coordinateV3ProductionClaimIsolated({
    ...context(orderId),
    checkoutOwner: "different-owner-001",
    checkoutAmountCents: amountCents
  })

  assert.equal(competingReplay.blocked, true)

  const unchanged = await PaymentOperation.findOne({ orderId }).lean()

  assert.equal(
    unchanged.squareIdempotencyKey,
    squareKeyFor(orderId)
  )
  assert.equal(
    unchanged.requestOwner,
    reservation.checkoutClaimOwner
  )

  console.log("PASS: Same-owner replay blocked")
  console.log("PASS: Competing-owner replay blocked")

  // Simulate interruption after the operation claim,
  // before the reservation claim.
  const interruptedId = "507f191e810c19729de860ed"
  await createPair(interruptedId)

  await assert.rejects(
    coordinateV3ProductionClaimIsolated({
      ...context(interruptedId),
      checkoutOwner: "interrupted-owner-001",
      checkoutAmountCents: amountCents,
      afterOperationClaim: async () => {
        throw new Error("SIMULATED_INTERRUPTION")
      }
    }),
    /SIMULATED_INTERRUPTION/
  )

  const interruptedOperation =
    await PaymentOperation.findOne({
      orderId: interruptedId
    }).lean()

  const interruptedReservation =
    await Reservation.findOne({
      orderId: interruptedId
    }).lean()

  assert.equal(
    interruptedOperation.squareIdempotencyKey,
    squareKeyFor(interruptedId)
  )

  assert.equal(
    interruptedOperation.requestOwner,
    "interrupted-owner-001"
  )

  assert.equal(
    interruptedOperation.status,
    "reconciliation_required"
  )

  assert.ok(
    interruptedOperation.squareCreationAttemptClaimedAt
  )

  assert.equal(interruptedReservation.status, "reserved")
  assert.equal(interruptedReservation.attemptClaimedAt, null)

  const retry = await coordinateV3ProductionClaimIsolated({
    ...context(interruptedId),
    checkoutOwner: "interrupted-owner-001",
    checkoutAmountCents: amountCents
  })

  assert.equal(retry.blocked, true)
  assert.equal(retry.retryAuthorized, false)

  console.log("PASS: Interrupted operation retains Square identity")
  console.log("PASS: Interrupted operation remains held")
  console.log("PASS: Retry after interruption blocked")

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )
  assert.equal(
    await Reservation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: No duplicate purchase records")
  console.log("\nSTEP 306: COORDINATED IDENTITY MONGODB PASSED")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PRODUCTION DATABASE WRITES")
} finally {
  await mongoose.disconnect()
  if (server) await server.stop()
}
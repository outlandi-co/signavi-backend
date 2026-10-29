import assert from "node:assert/strict"
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

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey = `signavi-v3-production-purchase-${orderId}`
const amountCents = 2500

let server

try {
  server = await MongoMemoryServer.create()

  await mongoose.connect(server.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(mongoose.connection.readyState, 1)

  console.log("PASS: Isolated MongoDB connected")

  await Reservation.init()
  await PaymentOperation.init()

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
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const context = {
    orderId,
    Reservation,
    PaymentOperation
  }

  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      coordinateV3ProductionClaimIsolated({
        ...context,
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

  console.log("PASS: Exactly one coordinated claim")
  console.log("PASS: 49 competing claims blocked")

  const reservation = await Reservation.findOne({ orderId }).lean()
  const operation = await PaymentOperation.findOne({ orderId }).lean()

  assert.ok(reservation)
  assert.ok(operation)

  assert.equal(reservation.status, "claim_pending")
  assert.ok(reservation.attemptClaimedAt)

  assert.equal(reservation.checkoutClaimAmountCents, amountCents)

  const validOwners = new Set(
    Array.from(
      { length: 50 },
      (_, index) =>
        `checkout-owner-${String(index).padStart(3, "0")}`
    )
  )

  assert.ok(validOwners.has(reservation.checkoutClaimOwner))

  assert.equal(operation.status, "reconciliation_required")
  assert.ok(operation.squareCreationAttemptClaimedAt)

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: Checkout owner persisted")
  console.log("PASS: Checkout amount persisted")
  console.log("PASS: Payment operation held for reconciliation")
  console.log("PASS: No duplicate records")

  const replay = await coordinateV3ProductionClaimIsolated({
    ...context,
    checkoutOwner: reservation.checkoutClaimOwner,
    checkoutAmountCents: amountCents
  })

  assert.equal(replay.blocked, true)
  assert.equal(replay.squareCreationAuthorized, false)
  assert.equal(replay.retryAuthorized, false)

  console.log("PASS: Repeated checkout claim blocked")
  console.log("PASS: Square authorization remains disabled")
  console.log("PASS: Automatic retry remains disabled")

  console.log("\nSTEP 282: MONGODB OWNERSHIP CONCURRENCY PASSED")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PRODUCTION DATABASE WRITES")
} finally {
  await mongoose.disconnect()

  if (server) {
    await server.stop()
  }
}
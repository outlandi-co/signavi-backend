import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const { default: PaymentOperation } = await import(
  "../models/SmartShippingV3PaymentOperation.js"
)

const { claimV3ProductionSquareIdentityIsolated } = await import(
  "../utils/claimV3ProductionSquareIdentityIsolated.js"
)

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey =
  `signavi-v3-production-purchase-${orderId}`

let server

try {
  server = await MongoMemoryServer.create()

  await mongoose.connect(server.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await PaymentOperation.init()

  await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    amountCents: 2500,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      claimV3ProductionSquareIdentityIsolated({
        PaymentOperation,
        orderId,
        amountCents: 2500,
        owner: `checkout-owner-${String(index).padStart(3, "0")}`
      })
    )
  )

  const winners = attempts.filter(x => x.claimed === true)
  const blocked = attempts.filter(x => x.blocked === true)

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 49)

  const stored = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(
    stored.squareIdempotencyKey,
    winners[0].squareIdempotencyKey
  )

  assert.equal(stored.requestOwner, winners[0].owner)
  assert.equal(stored.amountCents, 2500)
  assert.equal(stored.status, "reconciliation_required")
  assert.ok(stored.squareCreationAttemptClaimedAt)

  assert.equal(winners[0].squareRequestAuthorized, false)
  assert.equal(winners[0].retryAuthorized, false)

  console.log("PASS: 50 concurrent claims")
  console.log("PASS: 1 winner and 49 blocked")
  console.log("PASS: Square identity and owner persisted")
  console.log("PASS: Reconciliation hold persisted")
  console.log("PASS: Square execution remains disabled")

  const replay = await claimV3ProductionSquareIdentityIsolated({
    PaymentOperation,
    orderId,
    amountCents: 2500,
    owner: winners[0].owner
  })

  assert.equal(replay.blocked, true)

  const mismatch = await claimV3ProductionSquareIdentityIsolated({
    PaymentOperation,
    orderId,
    amountCents: 5000,
    owner: "checkout-other-owner"
  })

  assert.equal(mismatch.blocked, true)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: Replay blocked")
  console.log("PASS: Amount mismatch blocked")
  console.log("PASS: No duplicate payment operations")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect()
  if (server) await server.stop()
}
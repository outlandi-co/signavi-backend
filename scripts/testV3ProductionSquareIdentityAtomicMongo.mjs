import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"
import { createHash } from "node:crypto"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const orderId = "507f1f77bcf86cd799439011"
const purchaseKey = `signavi-v3-production-purchase-${orderId}`

const squareKey = `sv3p-${createHash("sha256")
  .update(`square-link:production:${purchaseKey}`)
  .digest("hex")
  .slice(0, 40)}`

let server

try {
  server = await MongoMemoryServer.create()

  await mongoose.connect(server.getUri(), {
    serverSelectionTimeoutMS: 10000
  })

  await PaymentOperation.init()

  const operation = await PaymentOperation.create({
    environment: "production",
    orderId,
    idempotencyKey: purchaseKey,
    amountCents: 2500,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: "",
    squareIdempotencyKey: null
  })

  assert.equal(operation.squareIdempotencyKey, null)

  const attempts = await Promise.all(
    Array.from({ length: 50 }, (_, index) =>
      PaymentOperation.findOneAndUpdate(
        {
          _id: operation._id,
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
        },
        {
          $set: {
            squareIdempotencyKey: squareKey,
            status: "reconciliation_required",
            squareCreationAttemptClaimedAt: new Date(),
            lastError: `Atomic Square identity test ${index}`
          }
        },
        {
          returnDocument: "after",
          runValidators: true
        }
      )
    )
  )

  const winners = attempts.filter(Boolean)

  assert.equal(winners.length, 1)

  const persisted = await PaymentOperation.findById(
    operation._id
  ).lean()

  assert.equal(persisted.squareIdempotencyKey, squareKey)
  assert.equal(persisted.status, "reconciliation_required")
  assert.ok(persisted.squareCreationAttemptClaimedAt)

  console.log("PASS: 50 concurrent atomic claims")
  console.log("PASS: Exactly 1 successful claim")
  console.log("PASS: 49 competing claims rejected")
  console.log("PASS: Square identity durably persisted")
  console.log("PASS: Reconciliation hold persisted")

  const replay = await PaymentOperation.findOneAndUpdate(
    {
      _id: operation._id,
      status: "pending",
      squareCreationAttemptClaimedAt: null,
      squareIdempotencyKey: null
    },
    {
      $set: {
        squareIdempotencyKey: `sv3p-${"b".repeat(40)}`
      }
    },
    {
      returnDocument: "after",
      runValidators: true
    }
  )

  assert.equal(replay, null)

  const confirmed = await PaymentOperation.findById(
    operation._id
  ).lean()

  assert.equal(confirmed.squareIdempotencyKey, squareKey)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("PASS: Conflicting replay cannot replace identity")
  console.log("PASS: No duplicate payment operations")
  console.log("NO SQUARE REQUESTS")
  console.log("ISOLATED MONGODB ONLY")
} finally {
  await mongoose.disconnect()
  if (server) await server.stop()
}
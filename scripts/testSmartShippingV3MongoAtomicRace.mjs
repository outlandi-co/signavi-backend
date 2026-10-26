import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import "dotenv/config"

const TEST_DB = "signavi_shipping_v3_recovery_tests"
const TEST_COLLECTION = "v3_webhook_atomic_race_synthetic"

const uri =
  process.env.SIGNAVI_V3_TEST_MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI

if (!uri) {
  console.error("STOP: MongoDB connection URI unavailable")
  process.exit(2)
}

const runId = `signavi-v3-atomic-${crypto.randomUUID()}`
const ids = []

const squareEnvironment = "sandbox"
const expectedSquareOrderId = `synthetic-square-${runId}`

const matchPayment = (id, paymentId) => ({
  _id: id,
  runId,
  squareEnvironment,

  paymentStatus: {
    $nin: ["paid", "refunded"]
  },

  status: {
    $nin: [
      "cancelled",
      "canceled",
      "refunded",
      "production",
      "shipped",
      "delivered",
      "completed"
    ]
  },

  squarePaymentId: {
    $in: [null, "", paymentId]
  },

  $or: [
    { squareOrderId: { $exists: false } },
    { squareOrderId: null },
    { squareOrderId: "" },
    { squareOrderId: expectedSquareOrderId }
  ]
})

const pay = async (collection, id, paymentId) => {
  const now = new Date()

  return collection.findOneAndUpdate(
    matchPayment(id, paymentId),
    {
      $set: {
        paymentStatus: "paid",
        status: "paid",
        paymentMethod: "Square",
        squarePaymentId: paymentId,
        squareOrderId: expectedSquareOrderId,
        paidAt: now
      },
      $push: {
        timeline: {
          status: "paid",
          date: now,
          note: "synthetic atomicity test"
        }
      }
    },
    { returnDocument: "after" }
  )
}

let connected = false
let collection

try {
  await mongoose.connect(uri, {
    dbName: TEST_DB,
    serverSelectionTimeoutMS: 7000,
    maxPoolSize: 5,
    autoIndex: false
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    TEST_DB,
    "STOP: Connected to unexpected database"
  )

  collection = mongoose.connection.db.collection(TEST_COLLECTION)

  const createFixture = async ({
    status = "payment_required",
    paymentStatus = "unpaid",
    squarePaymentId = "",
    squareOrderId = ""
  } = {}) => {
    const id = new mongoose.Types.ObjectId()
    ids.push(id)

    await collection.insertOne({
      _id: id,
      runId,
      squareEnvironment,
      status,
      paymentStatus,
      squarePaymentId,
      squareOrderId,
      timeline: [],
      syntheticTestOnly: true
    })

    return id
  }

  // Two deliveries attempt to confirm the same payment simultaneously.
  {
    const id = await createFixture()
    const paymentId = `same-payment-${runId}`

    const results = await Promise.all([
      pay(collection, id, paymentId),
      pay(collection, id, paymentId)
    ])

    assert.equal(results.filter(Boolean).length, 1)

    const saved = await collection.findOne({ _id: id, runId })

    assert.equal(saved.paymentStatus, "paid")
    assert.equal(saved.squarePaymentId, paymentId)
    assert.equal(saved.timeline.length, 1)

    console.log("MONGODB CONCURRENT SAME PAYMENT: ONE WRITE")
  }

  // Two different payment identities race for the same order.
  {
    const id = await createFixture()
    const a = `payment-a-${runId}`
    const b = `payment-b-${runId}`

    const results = await Promise.all([
      pay(collection, id, a),
      pay(collection, id, b)
    ])

    assert.equal(results.filter(Boolean).length, 1)

    const saved = await collection.findOne({ _id: id, runId })

    assert.ok([a, b].includes(saved.squarePaymentId))
    assert.equal(saved.paymentStatus, "paid")
    assert.equal(saved.timeline.length, 1)

    console.log("MONGODB CONFLICTING PAYMENTS: ONE WINNER")
  }

  // An existing paid order cannot be marked paid again.
  {
    const id = await createFixture({
      status: "paid",
      paymentStatus: "paid",
      squarePaymentId: `existing-${runId}`,
      squareOrderId: expectedSquareOrderId
    })

    const result = await pay(
      collection,
      id,
      `existing-${runId}`
    )

    assert.equal(result, null)

    const saved = await collection.findOne({ _id: id, runId })

    assert.equal(saved.timeline.length, 0)

    console.log("MONGODB ALREADY-PAID ORDER: NO WRITE")
  }

  // Refunded orders cannot be reopened.
  {
    const id = await createFixture({
      status: "refunded",
      paymentStatus: "refunded"
    })

    const result = await pay(
      collection,
      id,
      `refunded-${runId}`
    )

    assert.equal(result, null)

    console.log("MONGODB REFUNDED ORDER: NO WRITE")
  }

  // The wrong Square order identity must not overwrite an existing link.
  {
    const id = await createFixture({
      squareOrderId: `different-square-${runId}`
    })

    const result = await pay(
      collection,
      id,
      `mismatched-${runId}`
    )

    assert.equal(result, null)

    const saved = await collection.findOne({ _id: id, runId })

    assert.equal(saved.paymentStatus, "unpaid")

    console.log("MONGODB WRONG SQUARE ORDER: NO WRITE")
  }

  console.log("ALL FIVE MONGODB ATOMICITY SCENARIOS: PASS")
  console.log("DATABASE:", TEST_DB)
  console.log("COLLECTION:", TEST_COLLECTION)
} finally {
  if (connected) {
    try {
      if (collection && ids.length > 0) {
        const cleanup = await collection.deleteMany({
          _id: { $in: ids },
          runId,
          syntheticTestOnly: true
        })

        assert.equal(
          cleanup.deletedCount,
          ids.length,
          "STOP: Synthetic test cleanup incomplete"
        )

        console.log("SYNTHETIC TEST RECORDS CLEANED:", cleanup.deletedCount)
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}

console.log("NO EXISTING SIGNAVI ORDER OR INVOICE MODIFIED")
console.log("NO SQUARE API REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO DEPLOYMENT")
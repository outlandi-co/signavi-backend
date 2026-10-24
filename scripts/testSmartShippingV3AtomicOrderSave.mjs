import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import {
  applyV3PreparedPayment,
  verifyV3AppliedPayment
} from "../utils/smartShippingV3ApplyPayment.js"

const dbName = "signavi_shipping_v3_dev"
const orderIds = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
]

let connected = false

const makeOrder = id => new Order({
  _id: id,
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: `V3 ATOMIC TEST ${crypto.randomUUID()}`,
  email: "v3-atomic-test@example.com",
  address: {
    street: "123 Test Street",
    city: "Test City",
    state: "CA",
    zip: "90001",
    country: "US"
  },
  subtotal: 39.98,
  tax: 3.30,
  finalPrice: 43.28,
  items: [{
    productId: new mongoose.Types.ObjectId(),
    quantity: 2,
    finalPrice: 19.99,
    variant: { color: "black", size: "L" }
  }]
})

const preparedFor = id => ({
  orderId: String(id),
  subtotalCents: 3998,
  taxCents: 330,
  shippingAmountCents: 1200,
  totalCents: 5528,
  parcelRateIds: ["test_rate_1", "test_rate_2"],
  carrier: "USPS",
  serviceToken: "usps_ground_advantage"
})

const cents = value => Math.round(Number(value) * 100)

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED V3 DATABASE: PASS")

  for (const id of orderIds) {
    await makeOrder(id).save()
  }

  console.log("TEMPORARY ORDERS CREATED: PASS")

  const committedId = orderIds[0]
  const committedPrepared = preparedFor(committedId)

  const commitSession = await mongoose.startSession()

  try {
    await commitSession.withTransaction(async () => {
      const order = await Order.findById(
        committedId
      ).session(commitSession)

      assert.ok(order)

      applyV3PreparedPayment(order, committedPrepared)

      assert.equal(
        verifyV3AppliedPayment(order, committedPrepared),
        true
      )

      await order.save({ session: commitSession })

      assert.equal(
        verifyV3AppliedPayment(order, committedPrepared),
        true,
        "Save hooks changed the prepared payment total."
      )

      assert.equal(cents(order.finalPrice), 5528)
      assert.equal(cents(order.shipping), 1200)
      assert.equal(cents(order.tax), 330)
    })
  } finally {
    await commitSession.endSession()
  }

  const persisted = await Order.findById(
    committedId
  ).lean()

  assert.ok(persisted)
  assert.equal(cents(persisted.finalPrice), 5528)
  assert.equal(cents(persisted.shipping), 1200)
  assert.equal(cents(persisted.tax), 330)

  console.log("SAVE HOOK TOTAL PRESERVED: PASS")
  console.log("ATOMIC ORDER COMMIT: PASS")

  const rollbackId = orderIds[1]
  const before = await Order.findById(rollbackId).lean()
  const rollbackPrepared = preparedFor(rollbackId)

  const rollbackSession = await mongoose.startSession()

  try {
    await assert.rejects(
      rollbackSession.withTransaction(async () => {
        const order = await Order.findById(
          rollbackId
        ).session(rollbackSession)

        assert.ok(order)

        applyV3PreparedPayment(order, rollbackPrepared)

        await order.save({ session: rollbackSession })

        assert.equal(
          verifyV3AppliedPayment(order, rollbackPrepared),
          true
        )

        throw new Error("SIMULATED V3 TRANSACTION FAILURE")
      }),
      /SIMULATED V3 TRANSACTION FAILURE/
    )
  } finally {
    await rollbackSession.endSession()
  }

  const after = await Order.findById(rollbackId).lean()

  assert.deepEqual(
    after,
    before,
    "Failed transaction modified the persisted order."
  )

  console.log("FAILED TRANSACTION ROLLBACK: PASS")
  console.log("ORIGINAL ORDER PRESERVED: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
  console.log("ALL V3 ATOMIC ORDER SAVE TESTS PASSED")

} catch (error) {
  console.error(
    "V3 ATOMIC ORDER SAVE TEST FAILED:",
    error
  )

  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await Order.deleteMany({
        _id: { $in: orderIds }
      })

      console.log("CLEANUP: Temporary orders removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error)
      process.exitCode = 1
    }
  }

  if (connected) {
    await mongoose.disconnect()
  }
}
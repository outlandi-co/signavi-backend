import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  prepareV3PaymentOperation
} from "../utils/smartShippingV3PaymentOperation.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()

let connected = false

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  await PaymentOperation.init()

  console.log("ISOLATED V3 DATABASE: PASS")

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      prepareV3PaymentOperation({
        orderId,
        amountCents: 5528
      })
    )
  )

  assert.equal(attempts.length, 10)

  const keys = new Set(
    attempts.map(item => item.idempotencyKey)
  )

  assert.equal(keys.size, 1)

  const saved = await PaymentOperation.findOne({ orderId })

  assert.ok(saved)
  assert.equal(saved.amountCents, 5528)
  assert.equal(saved.idempotencyKey, attempts[0].idempotencyKey)

  const count = await PaymentOperation.countDocuments({ orderId })
  assert.equal(count, 1)

  console.log("10 CONCURRENT SERVICE REQUESTS: PASS")
  console.log("SINGLE PAYMENT OPERATION: PASS")
  console.log("STABLE IDEMPOTENCY KEY: PASS")
  console.log("SAVED PAYMENT TOTAL: PASS ($55.28)")

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 9999
    }),
    /mismatch/
  )

  console.log("CHANGED PAYMENT AMOUNT: PASS (rejected)")

  await PaymentOperation.updateOne(
    { orderId },
    { $set: { status: "reconciliation_required" } }
  )

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 5528
    }),
    /reconciliation/
  )

  console.log("UNCERTAIN PAYMENT OPERATION: PASS (blocked)")

  await PaymentOperation.updateOne(
    { orderId },
    { $set: { status: "completed" } }
  )

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 5528
    }),
    /reconciliation/
  )

  console.log("COMPLETED PAYMENT OPERATION: PASS (blocked)")
  console.log("ALL V3 PAYMENT OPERATION SERVICE TESTS PASSED")

} catch (error) {
  console.error("V3 PAYMENT OPERATION SERVICE TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      const result = await PaymentOperation.deleteMany({ orderId })

      console.log(
        `CLEANUP: ${result.deletedCount} temporary operation(s) removed`
      )
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
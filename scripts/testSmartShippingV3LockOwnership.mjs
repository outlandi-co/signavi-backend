import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation,
  releaseV3UnstartedPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  markV3PaymentRequestStarted
} from "../utils/smartShippingV3PaymentState.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
let connected = false

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)
  await PaymentOperation.init()

  console.log("ISOLATED V3 DATABASE: PASS")

  const first = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(first.success, true)

  const oldOwner = first.lock.owner
  const idempotencyKey = first.operation.idempotencyKey

  const released = await releaseV3UnstartedPreparation({
    lock: first.lock,
    squareRequestStarted: false
  })

  assert.equal(released, true)
  console.log("ORIGINAL LOCK RELEASED: PASS")

  const second = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(second.success, true)
  assert.notEqual(second.lock.owner, oldOwner)

  console.log("NEW CHECKOUT OWNER ACQUIRED LOCK: PASS")

  await assert.rejects(
    markV3PaymentRequestStarted({
      orderId,
      owner: oldOwner,
      amountCents: 5528,
      idempotencyKey
    }),
    /ownership/
  )

  console.log("FORMER LOCK OWNER: PASS (rejected)")

  const pending = await PaymentOperation.findOne({ orderId })

  assert.equal(pending.status, "pending")

  console.log("REJECTED UPDATE LEFT STATE UNCHANGED: PASS")

  const started = await markV3PaymentRequestStarted({
    orderId,
    owner: second.lock.owner,
    amountCents: 5528,
    idempotencyKey
  })

  assert.equal(started.status, "reconciliation_required")

  console.log("CURRENT LOCK OWNER STARTED PAYMENT: PASS")

  await assert.rejects(
    markV3PaymentRequestStarted({
      orderId,
      owner: second.lock.owner,
      amountCents: 5528,
      idempotencyKey
    }),
    /rejected/
  )

  console.log("DUPLICATE STATE TRANSITION: PASS (rejected)")
  console.log("ALL V3 LOCK-OWNERSHIP TESTS PASSED")

} catch (error) {
  console.error("V3 LOCK-OWNERSHIP TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })

      await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .deleteOne({ _id: orderId })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
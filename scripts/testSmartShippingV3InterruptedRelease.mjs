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

  const started = await markV3PaymentRequestStarted({
    orderId,
    owner: first.lock.owner,
    amountCents: 5528,
    idempotencyKey: first.operation.idempotencyKey
  })

  assert.equal(started.status, "reconciliation_required")
  assert.equal(started.requestOwner, first.lock.owner)

  console.log("PAYMENT REQUEST STATE PERSISTED: PASS")

  await assert.rejects(
    releaseV3UnstartedPreparation({
      lock: first.lock
    }),
    /unstarted operation/
  )

  console.log("FALSE UNSTARTED CLAIM REJECTED: PASS")

  const lock = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({ _id: orderId })

  assert.ok(lock)
  assert.equal(lock.owner, first.lock.owner)

  console.log("ORIGINAL CHECKOUT LOCK RETAINED: PASS")

  const retry = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(retry.success, false)
  assert.equal(retry.reason, "checkout_in_progress")

  console.log("DUPLICATE CHECKOUT BLOCKED: PASS")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.ok(saved)
  assert.equal(saved.status, "reconciliation_required")
  assert.equal(saved.amountCents, 5528)
  assert.equal(saved.requestOwner, first.lock.owner)
  assert.equal(
    saved.idempotencyKey,
    first.operation.idempotencyKey
  )
  assert.equal(saved.squarePaymentLinkId, "")
  assert.equal(saved.squareOrderId, "")

  console.log("UNCERTAIN PAYMENT STATE PRESERVED: PASS")
  console.log("PAYMENT AMOUNT AND KEY PRESERVED: PASS")
  console.log("ALL INTERRUPTED-RELEASE SAFETY TESTS PASSED")

} catch (error) {
  console.error("INTERRUPTED-RELEASE TEST FAILED:", error)
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
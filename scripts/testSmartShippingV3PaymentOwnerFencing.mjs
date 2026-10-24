import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  markV3PaymentRequestStarted,
  markV3PaymentCompleted
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

  const firstOwner = first.lock.owner
  const idempotencyKey = first.operation.idempotencyKey

  const started = await markV3PaymentRequestStarted({
    orderId,
    owner: firstOwner,
    amountCents: 5528,
    idempotencyKey
  })

  assert.equal(started.status, "reconciliation_required")
  assert.equal(started.requestOwner, firstOwner)

  console.log("ORIGINAL PAYMENT OWNER RECORDED: PASS")

  // Simulate an administrative lock replacement.
  // This is deliberately NOT the normal checkout path.
  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const replacementOwner = "replacement-owner-for-test"

  await locks.updateOne(
    { _id: orderId, owner: firstOwner },
    { $set: { owner: replacementOwner } }
  )

  const fakeSquareResult = {
    orderId,
    amountCents: 5528,
    idempotencyKey,
    paymentUrl: "https://sandbox.square.test/payment",
    squarePaymentLinkId: "sandbox-link-test",
    squareOrderId: "sandbox-order-test"
  }

  await assert.rejects(
    markV3PaymentCompleted({
      ...fakeSquareResult,
      owner: firstOwner
    }),
    /ownership/
  )

  console.log("FORMER LOCK OWNER REJECTED: PASS")

  await assert.rejects(
    markV3PaymentCompleted({
      ...fakeSquareResult,
      owner: replacementOwner
    }),
    /rejected/
  )

  console.log("REPLACEMENT OWNER CANNOT COMPLETE: PASS")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.equal(saved.status, "reconciliation_required")
  assert.equal(saved.requestOwner, firstOwner)
  assert.equal(saved.squarePaymentLinkId, "")
  assert.equal(saved.squareOrderId, "")

  console.log("UNCERTAIN PAYMENT STATE PRESERVED: PASS")
  console.log("ORIGINAL PAYMENT OWNER PRESERVED: PASS")
  console.log("NO SQUARE IDENTIFIERS STORED: PASS")
  console.log("ALL V3 PAYMENT-OWNER FENCING TESTS PASSED")

} catch (error) {
  console.error("V3 PAYMENT-OWNER FENCING TEST FAILED:", error)
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
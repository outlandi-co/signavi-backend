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

  const prepared = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(prepared.success, true)

  const args = {
    orderId,
    owner: prepared.lock.owner,
    amountCents: 5528,
    idempotencyKey: prepared.operation.idempotencyKey
  }

  await assert.rejects(
    markV3PaymentRequestStarted({
      ...args,
      owner: "incorrect-owner"
    }),
    /ownership/
  )

  console.log("INCORRECT LOCK OWNER: PASS (rejected)")

  await assert.rejects(
    markV3PaymentRequestStarted({
      ...args,
      amountCents: 9999
    }),
    /rejected/
  )

  console.log("CHANGED PAYMENT AMOUNT: PASS (rejected)")

  const started = await markV3PaymentRequestStarted(args)

  assert.equal(started.status, "reconciliation_required")
  assert.equal(started.amountCents, 5528)

  console.log("PAYMENT REQUEST STARTED: PASS")
  console.log("DURABLE UNCERTAIN STATE: PASS")

  await assert.rejects(
    markV3PaymentRequestStarted(args),
    /rejected/
  )

  console.log("DUPLICATE PAYMENT START: PASS (rejected)")

  await assert.rejects(
    markV3PaymentCompleted({
      ...args,
      paymentUrl: "invalid-url",
      squarePaymentLinkId: "test-link",
      squareOrderId: "test-square-order"
    }),
    /Incomplete/
  )

  console.log("INVALID PAYMENT URL: PASS (rejected)")

  const completed = await markV3PaymentCompleted({
    ...args,
    paymentUrl: "https://sandbox.square.test/payment",
    squarePaymentLinkId: "sandbox-link-test",
    squareOrderId: "sandbox-order-test"
  })

  assert.equal(completed.status, "completed")
  assert.equal(completed.amountCents, 5528)
  assert.equal(
    completed.idempotencyKey,
    prepared.operation.idempotencyKey
  )

  console.log("PAYMENT LINK COMPLETION: PASS")
  console.log("STABLE PAYMENT AMOUNT: PASS ($55.28)")
  console.log("STABLE IDEMPOTENCY KEY: PASS")

  await assert.rejects(
    markV3PaymentCompleted({
      ...args,
      paymentUrl: "https://sandbox.square.test/duplicate",
      squarePaymentLinkId: "duplicate",
      squareOrderId: "duplicate"
    }),
    /rejected/
  )

  console.log("DUPLICATE COMPLETION: PASS (rejected)")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.equal(saved.status, "completed")
  assert.equal(saved.amountCents, 5528)

  console.log("DATABASE PERSISTENCE: PASS")
  console.log("ALL V3 PAYMENT-STATE TESTS PASSED")

} catch (error) {
  console.error("V3 PAYMENT-STATE TEST FAILED:", error)
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
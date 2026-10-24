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

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      markV3PaymentRequestStarted(args)
    )
  )

  const winners = results.filter(
    result => result.status === "fulfilled"
  )

  const blocked = results.filter(
    result => result.status === "rejected"
  )

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 9)

  assert.equal(
    winners[0].value.status,
    "reconciliation_required"
  )

  console.log("10 CONCURRENT PAYMENT STARTS: PASS (1 winner)")
  console.log("DUPLICATE STARTS: PASS (9 rejected)")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.ok(saved)
  assert.equal(saved.status, "reconciliation_required")
  assert.equal(saved.amountCents, 5528)
  assert.equal(saved.requestOwner, args.owner)
  assert.equal(saved.idempotencyKey, args.idempotencyKey)

  console.log("ATOMIC PAYMENT STATE PERSISTED: PASS")
  console.log("ORIGINAL PAYMENT OWNER PRESERVED: PASS")
  console.log("AMOUNT AND IDEMPOTENCY KEY PRESERVED: PASS")

  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const replacementOwner = "atomic-replacement-owner-test"

  const replacement = await locks.updateOne(
    {
      _id: orderId,
      owner: args.owner
    },
    {
      $set: { owner: replacementOwner }
    }
  )

  assert.equal(replacement.matchedCount, 1)

  console.log("LOCK OWNERSHIP REPLACED FOR TEST: PASS")

  const fakeResult = {
    orderId,
    amountCents: 5528,
    idempotencyKey: args.idempotencyKey,
    paymentUrl: "https://sandbox.square.test/payment",
    squarePaymentLinkId: "atomic-test-link",
    squareOrderId: "atomic-test-order"
  }

  await assert.rejects(
    markV3PaymentCompleted({
      ...fakeResult,
      owner: args.owner
    }),
    /ownership/
  )

  console.log("FORMER LOCK OWNER BLOCKED: PASS")

  await assert.rejects(
    markV3PaymentCompleted({
      ...fakeResult,
      owner: replacementOwner
    }),
    /rejected/
  )

  console.log("REPLACEMENT OWNER BLOCKED: PASS")

  const final = await PaymentOperation.findOne({ orderId })

  assert.equal(final.status, "reconciliation_required")
  assert.equal(final.requestOwner, args.owner)
  assert.equal(final.squarePaymentLinkId, "")
  assert.equal(final.squareOrderId, "")

  console.log("UNCERTAIN PAYMENT STATE PRESERVED: PASS")
  console.log("NO DUPLICATE SQUARE LINK RECORDED: PASS")
  console.log("ALL V3 ATOMIC CONCURRENCY TESTS PASSED")

} catch (error) {
  console.error("V3 ATOMIC CONCURRENCY TEST FAILED:", error)
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
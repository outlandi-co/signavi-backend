import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  prepareV3PaymentOperation
} from "../utils/smartShippingV3PaymentOperation.js"
import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const legacyId = new mongoose.Types.ObjectId()
const affectedIds = [orderId, legacyId]

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

  const expectedReference = createV3CheckoutReference({
    orderId
  })

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      prepareV3PaymentOperation({
        orderId,
        amountCents: 5528
      })
    )
  )

  assert.equal(attempts.length, 10)

  assert.ok(
    attempts.every(item =>
      item.checkoutReferenceId === expectedReference
    )
  )

  const keys = new Set(
    attempts.map(item => item.idempotencyKey)
  )

  assert.equal(keys.size, 1)

  console.log("10 CONCURRENT REFERENCES: PASS")
  console.log("STABLE IDEMPOTENCY KEY: PASS")

  const stored = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.ok(stored)
  assert.equal(stored.checkoutReferenceId, expectedReference)
  assert.equal(stored.amountCents, 5528)
  assert.equal(stored.environment, "sandbox")
  assert.equal(stored.status, "pending")

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("CANONICAL REFERENCE PERSISTED: PASS")
  console.log("SINGLE PAYMENT OPERATION: PASS")

  const retry = await prepareV3PaymentOperation({
    orderId,
    amountCents: 5528
  })

  assert.equal(retry.checkoutReferenceId, expectedReference)
  assert.equal(retry.idempotencyKey, stored.idempotencyKey)

  console.log("RETRY REUSES ORIGINAL REFERENCE: PASS")

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 9999
    }),
    /mismatch/
  )

  console.log("CHANGED PAYMENT AMOUNT REJECTED: PASS")

  // Simulate a tampered record using a raw collection
  // update in the isolated development database only.
  await PaymentOperation.collection.updateOne(
    { orderId },
    {
      $set: {
        checkoutReferenceId:
          createV3CheckoutReference({ orderId: legacyId })
      }
    }
  )

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 5528
    }),
    /mismatch/
  )

  console.log("SUBSTITUTED CHECKOUT REFERENCE BLOCKED: PASS")

  // Restore the test record, then confirm that an
  // uncertain payment cannot be prepared again.
  await PaymentOperation.collection.updateOne(
    { orderId },
    {
      $set: {
        checkoutReferenceId: expectedReference,
        status: "reconciliation_required"
      }
    }
  )

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId,
      amountCents: 5528
    }),
    /reconciliation/
  )

  console.log("UNCERTAIN PAYMENT RETRY BLOCKED: PASS")

  // Simulate an older pending operation that has no
  // checkoutReferenceId. It must not be silently upgraded.
  await PaymentOperation.collection.insertOne({
    orderId: legacyId,
    idempotencyKey:
      `signavi-v3-sandbox-legacy-${legacyId}`,
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  await assert.rejects(
    prepareV3PaymentOperation({
      orderId: legacyId,
      amountCents: 5528
    }),
    /mismatch/
  )

  const legacy = await PaymentOperation.collection.findOne({
    orderId: legacyId
  })

  assert.equal(
    Object.hasOwn(legacy, "checkoutReferenceId"),
    false
  )

  assert.equal(legacy.status, "pending")

  console.log("LEGACY RECORD WITHOUT REFERENCE BLOCKED: PASS")
  console.log("LEGACY RECORD LEFT UNCHANGED: PASS")

  console.log(
    "ALL V3 CHECKOUT REFERENCE PERSISTENCE TESTS PASSED"
  )

} catch (error) {
  console.error(
    "V3 CHECKOUT REFERENCE PERSISTENCE TEST FAILED:",
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
      await PaymentOperation.deleteMany({
        orderId: { $in: affectedIds }
      })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error)
      process.exitCode = 1
    }
  }

  if (connected) {
    await mongoose.disconnect()
  }
}
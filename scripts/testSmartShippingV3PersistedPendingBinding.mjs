import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  acquireV3CheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js"

import {
  createV3CheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  inspectV3PersistedPendingBinding
} from "../utils/smartShippingV3PersistedPendingBinding.js"

const databaseName = "signavi_shipping_v3_dev"
const uri = process.env.MONGO_URI

if (
  !["development", "test"].includes(process.env.NODE_ENV) ||
  String(process.env.SQUARE_ENVIRONMENT ?? "sandbox")
    .toLowerCase() !== "sandbox" ||
  !uri
) {
  throw new Error(
    "STOP: Isolated V3 test requires development/test, " +
    "Sandbox environment, and MONGO_URI."
  )
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3CheckoutReference({ orderId })
const key =
  "signavi-v3-sandbox-12345678-1234-4234-8234-" +
  orderId.slice(-12)

let lock = null
let connected = false

try {
  await mongoose.connect(uri, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName,
    "Refusing unexpected database."
  )

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "pending",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 5528,
    squarePaymentLinkId: ""
  })

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId: reference,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  lock = await acquireV3CheckoutLock(orderId)

  assert.ok(lock?.owner, "Could not acquire test lock.")

  const verified = await inspectV3PersistedPendingBinding({
    orderId,
    owner: lock.owner
  })

  assert.equal(verified.consistent, true)
  assert.equal(verified.amountCents, 5528)
  assert.equal(verified.checkoutReferenceId, reference)
  assert.equal(verified.idempotencyKey, key)
  assert.equal(verified.squareRequestAuthorized, false)
  assert.equal(verified.paymentCreated, false)

  console.log("PERSISTED ORDER + OPERATION: PASS")
  console.log("EXACT $55.28 AMOUNT: PASS")
  console.log("OWNED CHECKOUT LOCK: PASS")
  console.log("NO SQUARE AUTHORIZATION: PASS")

  await assert.rejects(
    inspectV3PersistedPendingBinding({
      orderId,
      owner: "not-the-checkout-lock-owner"
    })
  )

  console.log("WRONG LOCK OWNER BLOCKED: PASS")

  await PaymentOperation.collection.updateOne(
    { orderId: id },
    { $set: { amountCents: 5529 } }
  )

  await assert.rejects(
    inspectV3PersistedPendingBinding({
      orderId,
      owner: lock.owner
    }),
    /payment_amount_mismatch/
  )

  console.log("TAMPERED PERSISTED AMOUNT BLOCKED: PASS")

  await PaymentOperation.collection.updateOne(
    { orderId: id },
    { $set: { amountCents: 5528 } }
  )

  await PaymentOperation.collection.updateOne(
    { orderId: id },
    {
      $set: {
        status: "reconciliation_required",
        requestOwner: lock.owner
      }
    }
  )

  await assert.rejects(
    inspectV3PersistedPendingBinding({
      orderId,
      owner: lock.owner
    }),
    /payment_already_started_or_linked/
  )

  console.log("ALREADY STARTED PAYMENT BLOCKED: PASS")

  const operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.squareOrderId, "")
  assert.equal(operation.paymentUrl, "")

  console.log("NO SQUARE IDENTIFIERS CREATED: PASS")
  console.log("ALL PERSISTED BINDING TESTS PASSED")

} finally {
  if (connected) {
    // Delete only this test's randomly generated fixtures.
    if (
      mongoose.connection.db.databaseName === databaseName
    ) {
      await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .deleteOne({
          _id: id,
          ...(lock?.owner ? { owner: lock.owner } : {})
        })

      await PaymentOperation.collection.deleteOne({
        orderId: id
      })

      await Order.collection.deleteOne({
        _id: id
      })

      console.log("ISOLATED TEST FIXTURES CLEANED")
    }

    await mongoose.disconnect()
  }
}
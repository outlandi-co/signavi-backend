import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  inspectV3TrustedPaymentBinding
} from "../utils/smartShippingV3TrustedPaymentBinding.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
let connected = false

const inspect = () =>
  inspectV3TrustedPaymentBinding({ orderId })

const expectClassification = async (label, expected) => {
  const result = await inspect()

  assert.equal(result.classification, expected)
  assert.equal(result.squareLookupAuthorized, false)

  console.log(`${label}: PASS`)
  return result
}

const setOrder = async update =>
  Order.collection.updateOne(
    { _id: orderId },
    { $set: update }
  )

const setOperation = async update =>
  PaymentOperation.collection.updateOne(
    { orderId },
    { $set: update }
  )

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

  await expectClassification(
    "MISSING ORDER AND OPERATION",
    "missing_trusted_records"
  )

  // Temporary fixtures inserted directly into the
  // isolated collection to test read-only inspection.
  // These are NOT actual checkout orders.

  await Order.collection.insertOne({
    _id: orderId,
    customerName: "V3 Binding Test",
    email: "v3-binding@example.invalid",
    squareEnvironment: "sandbox",
    currency: "usd",
    status: "payment_required",
    paymentStatus: "pending",
    squareExpectedAmountCents: 5528,
    squarePaymentLinkId: "",
    squareOrderId: ""
  })

  await expectClassification(
    "MISSING PAYMENT OPERATION",
    "missing_trusted_records"
  )

  await PaymentOperation.create({
    orderId,
    idempotencyKey: `signavi-v3-sandbox-${orderId}`,
    amountCents: 5528,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "test-owner",
    squarePaymentLinkId: "test-link",
    squareOrderId: "test-square-order",
    paymentUrl: "https://square.link/u/test"
  })

  await setOrder({ squareEnvironment: "production" })
  await expectClassification(
    "PRODUCTION ORDER ENVIRONMENT REJECTED",
    "sandbox_environment_not_bound"
  )

  await setOrder({
    squareEnvironment: "sandbox",
    currency: "EUR"
  })
  await expectClassification(
    "WRONG CURRENCY REJECTED",
    "currency_mismatch"
  )

  await setOrder({
    currency: "usd",
    paymentStatus: "paid"
  })
  await expectClassification(
    "ALREADY PAID ORDER REJECTED",
    "order_not_awaiting_payment"
  )

  await setOrder({
    paymentStatus: "pending",
    squareExpectedAmountCents: 9999
  })
  await expectClassification(
    "AMOUNT MISMATCH REJECTED",
    "payment_amount_mismatch"
  )

  await setOrder({
    squareExpectedAmountCents: 5528
  })

  await setOperation({
    idempotencyKey: "invalid-test-key"
  })

  await expectClassification(
    "INVALID IDEMPOTENCY KEY REJECTED",
    "invalid_payment_operation_key"
  )

  await setOperation({
    idempotencyKey: `signavi-v3-sandbox-${orderId}`,
    status: "pending"
  })

  await expectClassification(
    "UNSTARTED PAYMENT REJECTED",
    "payment_request_not_started"
  )

  await setOperation({
    status: "reconciliation_required",
    requestOwner: ""
  })

  await expectClassification(
    "MISSING PAYMENT OWNER REJECTED",
    "missing_payment_request_owner"
  )

  await setOperation({
    requestOwner: "test-owner",
    squarePaymentLinkId: ""
  })

  await expectClassification(
    "MISSING SQUARE LINK REJECTED",
    "square_link_id_not_recorded"
  )

  await setOperation({
    squarePaymentLinkId: "test-link"
  })

  await setOrder({
    squarePaymentLinkId: "different-link"
  })

  await expectClassification(
    "DIFFERENT SQUARE LINK REJECTED",
    "square_link_identity_mismatch"
  )

  await setOrder({
    squarePaymentLinkId: "test-link",
    squareOrderId: "different-square-order"
  })

  await expectClassification(
    "DIFFERENT SQUARE ORDER REJECTED",
    "square_order_identity_mismatch"
  )

  await setOrder({
    squareOrderId: "test-square-order"
  })

  const matching = await expectClassification(
    "MATCHING RECORDS STILL BLOCKED",
    "checkout_reference_binding_required"
  )

  assert.equal(matching.recordsConsistent, true)
  assert.equal(matching.amountCents, 5528)

  const persisted = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(persisted.status, "reconciliation_required")
  assert.equal(persisted.squarePaymentLinkId, "test-link")

  console.log("PAYMENT STATE PRESERVED: PASS")
  console.log("NO SQUARE LOOKUP AUTHORIZED: PASS")
  console.log("ALL V3 TRUSTED BINDING TESTS PASSED")

} catch (error) {
  console.error("V3 TRUSTED BINDING TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })
      await Order.collection.deleteOne({ _id: orderId })

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
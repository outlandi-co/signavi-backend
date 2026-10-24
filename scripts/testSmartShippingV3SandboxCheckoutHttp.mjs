import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import orderRoutes from "../routes/orders.js"
import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"
import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js"
import {
  createV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const locksName = "smart_shipping_v3_checkout_locks"

process.env.NODE_ENV = "development"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED = "true"
delete process.env.SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

let connected = false
let server

const readState = async () => ({
  order: await Order.findById(orderId).lean(),
  operation: await PaymentOperation.findOne({
    orderId
  }).lean(),
  lock: await mongoose.connection
    .collection(locksName)
    .findOne({ _id: orderId })
})

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)
  console.log("ISOLATED V3 DATABASE: PASS")

  const order = await new Order({
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: `V3 SANDBOX HTTP ${crypto.randomUUID()}`,
    email: "v3-sandbox-http@example.com",
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
  }).save()

  const guestToken = createGuestCheckoutToken(order)
  const signedQuote = createV3SignedQuote({
    cartFingerprint: createV3OrderFingerprint(order),
    shippingAmountCents: 1200,
    parcelRateIds: ["test_rate_1", "test_rate_2"],
    carrier: "USPS",
    serviceToken: "usps_ground_advantage"
  })

  const app = express()
  app.use(express.json())
  app.use("/api/orders", orderRoutes)

  server = app.listen(0, "127.0.0.1")

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const base = `http://127.0.0.1:${server.address().port}`

  const checkout = async ({
    token = guestToken,
    quote = signedQuote,
    mode = "prepare"
  } = {}) => {
    const response = await fetch(
      `${base}/api/orders/${orderId}/checkout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-signavi-v3-sandbox-mode": mode,
          ...(token ? {
            "x-signavi-guest-checkout-token": token
          } : {})
        },
        body: JSON.stringify({ v3ShippingQuote: quote })
      }
    )

    return {
      status: response.status,
      body: await response.json()
    }
  }

  const before = await readState()
  assert.ok(before.order)
  assert.equal(before.operation, null)
  assert.equal(before.lock, null)

  // The HTTP flag must be explicitly enabled.
  const disabled = await checkout()
  assert.equal(disabled.status, 501)
  assert.equal(disabled.body.code, "V3_PREVIEW_ONLY")
  assert.deepEqual(await readState(), before)
  console.log("HTTP PREPARATION DISABLED BY DEFAULT: PASS")

  process.env.SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED = "true"

  const missingToken = await checkout({ token: "" })
  assert.equal(missingToken.status, 403)
  assert.deepEqual(await readState(), before)
  console.log("MISSING GUEST TOKEN BLOCKED: PASS")

  const invalidToken = await checkout({
    token: "invalid-token"
  })
  assert.equal(invalidToken.status, 403)
  assert.deepEqual(await readState(), before)
  console.log("INVALID GUEST TOKEN BLOCKED: PASS")

  const invalidQuote = await checkout({
    quote: signedQuote + "tampered"
  })
  assert.equal(invalidQuote.status, 400)
  assert.deepEqual(await readState(), before)
  console.log("TAMPERED QUOTE BLOCKED: PASS")

  const preview = await checkout({ mode: "preview" })
  assert.equal(preview.status, 501)
  assert.equal(preview.body.code, "V3_PREVIEW_ONLY")
  assert.deepEqual(await readState(), before)
  console.log("ORDINARY PREVIEW STILL UNCHANGED: PASS")

  const prepared = await checkout()
  assert.equal(prepared.status, 202)
  assert.equal(
    prepared.body.code,
    "V3_SANDBOX_PREPARED_NO_PAYMENT"
  )
  assert.equal(prepared.body.success, true)
  assert.equal(prepared.body.paymentCreated, false)
  assert.equal(prepared.body.squareRequestAuthorized, false)
  assert.equal(prepared.body.totalCents, 5528)
  assert.equal(prepared.body.shippingAmountCents, 1200)

  const after = await readState()
  assert.ok(after.order)
  assert.ok(after.operation)
  assert.ok(after.lock)

  assert.equal(after.order.squareEnvironment, "sandbox")
  assert.equal(after.order.squareExpectedAmountCents, 5528)
  assert.equal(Math.round(after.order.finalPrice * 100), 5528)
  assert.equal(Math.round(after.order.shipping * 100), 1200)

  assert.equal(after.operation.amountCents, 5528)
  assert.equal(after.operation.environment, "sandbox")
  assert.equal(after.operation.status, "pending")
  assert.equal(after.operation.requestOwner, "")
  assert.equal(after.operation.squarePaymentLinkId, "")
  assert.equal(after.operation.squareOrderId, "")
  assert.equal(after.operation.paymentUrl, "")

  console.log("GUARDED SANDBOX HTTP PREPARATION: PASS")
  console.log("ORDER/OPERATION PERSISTENCE: PASS")
  console.log("NO PAYMENT STARTED: PASS")

  const duplicate = await checkout()
  assert.equal(duplicate.status, 409)
  assert.equal(
    duplicate.body.code,
    "V3_SANDBOX_CHECKOUT_IN_PROGRESS"
  )

  assert.deepEqual(await readState(), after)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    1
  )

  console.log("DUPLICATE HTTP CHECKOUT BLOCKED: PASS")
  console.log("SINGLE PAYMENT OPERATION: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
  console.log("ALL V3 SANDBOX HTTP TESTS PASSED")

} catch (error) {
  console.error("V3 SANDBOX HTTP TEST FAILED:", error)
  process.exitCode = 1

} finally {
  delete process.env.SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED

  if (server) {
    await new Promise(resolve => server.close(resolve))
  }

  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })

      await mongoose.connection
        .collection(locksName)
        .deleteOne({ _id: orderId })

      await Order.deleteOne({ _id: orderId })

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
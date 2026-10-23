import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import orderRoutes from "../routes/orders.js"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { createV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const marker = `V3 HTTP TEST ${crypto.randomUUID()}`

process.env.NODE_ENV = "development"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "sandbox"

// Temporary signing keys are isolated to this Node test process.
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

let connected = false
let server
let created = false

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED DEVELOPMENT DATABASE: PASS")

  const order = new Order({
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: marker,
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "90001",
      country: "US"
    },
    email: "v3-http-test@example.com",
    subtotal: 39.98,
    tax: 3.30,
    finalPrice: 43.28,
    items: [{
      productId: new mongoose.Types.ObjectId(),
      quantity: 2,
      finalPrice: 19.99,
      variant: { color: "black", size: "L" }
    }]
  })

  await order.save()
  created = true

  const original = await Order.findById(orderId).lean()
  assert.ok(original)

  const persistedOrder = await Order.findById(orderId)
  const guestToken = createGuestCheckoutToken(persistedOrder)

  const signedQuote = createV3SignedQuote({
    cartFingerprint: createV3OrderFingerprint(persistedOrder),
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

  const checkout = async (token, quote) => {
    const response = await fetch(
      `${base}/api/orders/${orderId}/checkout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? {
            "x-signavi-guest-checkout-token": token
          } : {})
        },
        body: JSON.stringify({
          v3ShippingQuote: quote
        })
      }
    )

    return {
      status: response.status,
      data: await response.json()
    }
  }

  const missingToken = await checkout(null, signedQuote)
  assert.equal(missingToken.status, 403)
  console.log("MISSING GUEST TOKEN: PASS (403)")

  const invalidToken = await checkout(
    "invalid-test-token",
    signedQuote
  )
  assert.equal(invalidToken.status, 403)
  console.log("INVALID GUEST TOKEN: PASS (403)")

  const missingQuote = await checkout(guestToken, null)
  assert.equal(missingQuote.status, 400)
  console.log("MISSING SHIPPING QUOTE: PASS (400)")

  const tamperedQuote = await checkout(
    guestToken,
    signedQuote + "tampered"
  )
  assert.equal(tamperedQuote.status, 400)
  console.log("TAMPERED SHIPPING QUOTE: PASS (400)")

  const valid = await checkout(guestToken, signedQuote)

  assert.equal(valid.status, 501)
  assert.equal(valid.data.code, "V3_PREVIEW_ONLY")
  assert.equal(valid.data.success, false)
  assert.equal(valid.data.preview?.totalCents, 5528)
  assert.equal(valid.data.preview?.shippingAmountCents, 1200)

  console.log("VALID V3 PREVIEW: PASS (501)")
  console.log("VERIFIED PAYMENT TOTAL: PASS ($55.28)")

  const after = await Order.findById(orderId).lean()

  assert.deepEqual(
    after,
    original,
    "Preview must not modify the persisted order"
  )

  console.log("DATABASE ORDER UNCHANGED: PASS")

  const paymentOperation =
    await PaymentOperation.findOne({ orderId }).lean()

  assert.equal(
    paymentOperation,
    null,
    "Preview must not create a payment operation"
  )

  console.log("NO V3 PAYMENT OPERATION: PASS")

  const checkoutLock = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({ _id: orderId })

  assert.equal(
    checkoutLock,
    null,
    "Preview must not acquire or persist a checkout lock"
  )

  console.log("NO V3 CHECKOUT LOCK: PASS")
  console.log("SQUARE PAYMENT NOT CREATED: PASS")
  console.log("ALL V3 CHECKOUT HTTP TESTS PASSED")

} catch (error) {
  console.error("V3 CHECKOUT HTTP FAILED:", error)
  process.exitCode = 1

} finally {
  if (server) {
    await new Promise(resolve => server.close(resolve))
  }

  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName &&
    created
  ) {
    const result = await Order.deleteOne({
      _id: orderId,
      customerName: marker
    })

    if (result.deletedCount === 1) {
      console.log("CLEANUP: Temporary order removed")
    } else {
      console.error("CLEANUP FAILED: Test order not removed")
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

delete process.env.MONGO_URI

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED = "true"
process.env.SMART_SHIPPING_V3_DURABLE_LINK_ENABLED = "true"
process.env.SMART_SHIPPING_V3_INVOICE_HTTP_TEST_ENABLED = "true"

process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex")
process.env.SHIPPING_QUOTE_SECRET = crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET = crypto.randomBytes(48).toString("hex")

let replica
let server

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test"),
    { serverSelectionTimeoutMS: 10000 }
  )

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_reservation_isolated_test"
  )

  const { default: Order } = await import("../models/Order.js")
  const { default: Invoice } = await import("../models/Invoice.js")
  const { default: Association } = await import(
    "../models/SmartShippingV3InvoiceOrderAssociation.js"
  )
  const { default: Ownership } = await import(
    "../models/SmartShippingV3PurchaseOwnership.js"
  )
  const { default: Operation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )
  const { createGuestCheckoutToken } = await import(
    "../utils/guestCheckoutToken.js"
  )
  const { createV3OrderFingerprint } = await import(
    "../utils/smartShippingV3OrderFingerprint.js"
  )
  const { createV3SignedQuote } = await import(
    "../utils/smartShippingV3QuoteSigning.js"
  )
  const { default: routes } = await import(
    "../routes/smartShippingV3InvoiceAssociationTestRoutes.js"
  )

  await Association.init()
  await Ownership.init()
  await Operation.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()

  const order = await new Order({
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: "V3 HTTP Invoice Test",
    email: "v3-invoice-test@example.invalid",
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

  await Invoice.collection.insertOne({
    _id: invoiceId,
    customerName: "V3 HTTP Invoice Test",
    customerEmail: "v3-invoice-test@example.invalid",
    status: "draft",
    paymentStatus: "unpaid",
    total: 55.28,
    finalProof: { approved: false }
  })

  const guestToken = createGuestCheckoutToken(order)

  const signedQuote = createV3SignedQuote({
    cartFingerprint: createV3OrderFingerprint(order),
    shippingAmountCents: 1200,
    parcelRateIds: ["test_rate_1", "test_rate_2"],
    carrier: "USPS",
    serviceToken: "usps_ground_advantage"
  })

  const sign = role => jwt.sign(
    {
      id: String(new mongoose.Types.ObjectId()),
      role,
      email: "test@example.invalid"
    },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
  )

  const adminToken = sign("admin")
  const customerToken = sign("customer")

  const app = express()
  app.use(express.json())
  app.use("/api/v3-invoice-test", routes)

  server = app.listen(0, "127.0.0.1")

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const url =
    `http://127.0.0.1:${server.address().port}` +
    `/api/v3-invoice-test/orders/${orderId}` +
    `/invoices/${invoiceId}/prepare-association`

  const request = async ({
    token = adminToken,
    credentials = true
  } = {}) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...(credentials
          ? { "x-signavi-guest-checkout-token": guestToken }
          : {})
      },
      body: JSON.stringify(
        credentials
          ? { v3ShippingQuote: signedQuote }
          : {}
      )
    })

    return {
      status: response.status,
      body: await response.json()
    }
  }

  const noAuth = await request({ token: null })
  assert.equal(noAuth.status, 401)
  console.log("INVOICE HTTP NO TOKEN: 401 PASS")

  const nonAdmin = await request({ token: customerToken })
  assert.equal(nonAdmin.status, 403)
  console.log("INVOICE HTTP NON-ADMIN: 403 PASS")

  process.env.SMART_SHIPPING_V3_INVOICE_HTTP_TEST_ENABLED = "false"

  const disabled = await request()
  assert.equal(disabled.status, 503)
  assert.equal(
    disabled.body.code,
    "V3_INVOICE_ASSOCIATION_DISABLED"
  )

  process.env.SMART_SHIPPING_V3_INVOICE_HTTP_TEST_ENABLED = "true"

  console.log("INVOICE HTTP DISABLED FLAG: 503 PASS")

  const missing = await request({ credentials: false })
  assert.equal(missing.status, 400)
  console.log("INVOICE HTTP MISSING CREDENTIALS: 400 PASS")

  const before = await Association.countDocuments({ orderId })
  assert.equal(before, 0)

  const success = await request()

  assert.equal(success.status, 202)
  assert.equal(
    success.body.code,
    "V3_INVOICE_ASSOCIATED_NO_PAYMENT"
  )
  assert.equal(success.body.paymentCreated, false)
  assert.equal(success.body.squareRequestAuthorized, false)
  assert.equal(success.body.amountCents, 5528)

  console.log("INVOICE HTTP DURABLE ASSOCIATION: 202 PASS")

  assert.equal(
    await Association.countDocuments({
      orderId,
      invoiceId,
      environment: "sandbox"
    }),
    1
  )

  assert.equal(await Operation.countDocuments({ orderId }), 0)

  assert.equal(
    await Ownership.countDocuments({
      purchaseKey: `order:${orderId}`,
      environment: "sandbox"
    }),
    0
  )

  console.log("ASSOCIATION WITHOUT PAYMENT OWNERSHIP: PASS")

  const duplicate = await request()
  assert.equal(duplicate.status, 409)
  assert.equal(
    duplicate.body.code,
    "V3_CHECKOUT_LOCK_UNAVAILABLE"
  )

  assert.equal(
    await Association.countDocuments({ orderId }),
    1
  )

  console.log("INVOICE HTTP DUPLICATE BLOCKED: 409 PASS")
  console.log("NO SQUARE REQUESTS")
  console.log("ALL DURABLE INVOICE HTTP TESTS PASSED")

} catch (error) {
  console.error("DURABLE INVOICE HTTP TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (server) {
    await new Promise(resolve => server.close(resolve))
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (replica) {
    await replica.stop()
  }
}
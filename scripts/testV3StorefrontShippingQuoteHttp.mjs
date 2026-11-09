import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"

import {
  createV3StorefrontShippingQuoteRouter
} from "../routes/v3StorefrontShippingQuote.js"

import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js"

import {
  verifyV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const order = {
  _id: "507f1f77bcf86cd799439011",
  source: "store",
  status: "payment_required",
  paymentStatus: "unpaid",
  customerName: "Test Customer",
  address: {
    street: "123 Example Street",
    city: "Merced",
    state: "CA",
    zip: "95340",
    country: "US"
  },
  items: [{
    productId: "507f191e810c19729de860ea",
    quantity: 2,
    finalPrice: 20,
    variant: {
      color: "black",
      size: "L"
    }
  }]
}

const token = createGuestCheckoutToken(order)

let orderLookups = 0
let carrierCalls = 0
let currentOrder = order

const shipment = id => ({
  rates: [{
    object_id: `ground_${id}`,
    provider: "USPS",
    carrier_account: "test_account",
    servicelevel: {
      token: "usps_ground_advantage",
      name: "Ground Advantage"
    },
    amount: "6.00",
    currency: "USD"
  }]
})

const app = express()
app.use(express.json())

app.use(
  "/api/v3/shipping",
  createV3StorefrontShippingQuoteRouter({
    findOrder: async id => {
      orderLookups++
      return id === String(order._id) ? currentOrder : null
    },
    getTrustedShipments: async () => {
      carrierCalls++
      return [shipment(1), shipment(2)]
    }
  })
)

const server = app.listen(0, "127.0.0.1")

try {
  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const base =
    `http://127.0.0.1:${server.address().port}` +
    `/api/v3/shipping/${order._id}/quote`

  const post = async ({
    url = base,
    guestToken,
    body = {}
  } = {}) => {
    const headers = { "Content-Type": "application/json" }

    if (guestToken !== undefined) {
      headers["x-signavi-guest-checkout-token"] = guestToken
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    })

    return {
      status: response.status,
      data: await response.json()
    }
  }

  const invalidId = await post({
    url: base.replace(String(order._id), "invalid"),
    guestToken: token
  })

  assert.equal(invalidId.status, 400)
  assert.equal(carrierCalls, 0)
  console.log("INVALID ORDER ID: PASS")

  const missingToken = await post()

  assert.equal(missingToken.status, 403)
  assert.equal(orderLookups, 0)
  assert.equal(carrierCalls, 0)
  console.log("MISSING GUEST TOKEN: PASS")

  const invalidToken = await post({
    guestToken: "invalid"
  })

  assert.equal(invalidToken.status, 403)
  assert.equal(carrierCalls, 0)
  console.log("INVALID GUEST TOKEN: PASS")

  const otherOrder = await post({
    url: base.replace(
      String(order._id),
      "507f1f77bcf86cd799439012"
    ),
    guestToken: token
  })

  assert.equal(otherOrder.status, 404)
  assert.equal(carrierCalls, 0)
  console.log("UNKNOWN ORDER: PASS")

  currentOrder = {
    ...order,
    paymentStatus: "paid"
  }

  const paid = await post({ guestToken: token })

  assert.equal(paid.status, 403)
  assert.equal(carrierCalls, 0)
  console.log("PAID ORDER: PASS")

  currentOrder = order

  const valid = await post({
    guestToken: token,
    body: {
      shippingAmountCents: 1,
      parcelRateIds: ["forged"],
      signedQuote: "forged"
    }
  })

  assert.equal(valid.status, 200)
  assert.equal(valid.data.success, true)
  assert.equal(valid.data.parcelCount, 2)
  assert.equal(carrierCalls, 1)
  assert.equal(valid.data.shippingOptions.length, 1)

  const option = valid.data.shippingOptions[0]

  assert.equal(option.amount, "12.00")

  const verified = verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint: createV3OrderFingerprint(order)
  })

  assert.ok(verified)
  assert.equal(verified.shippingAmountCents, 1200)
  console.log("ORDER-BOUND SIGNED QUOTE: PASS")
  console.log("FORGED BROWSER SHIPPING DATA IGNORED: PASS")

  assert.equal(
    carrierCalls,
    1,
    "Only the authorized request may invoke the carrier provider."
  )

  console.log("UNAUTHORIZED PROVIDER CALLS: ZERO")
  console.log("ALL V3 STOREFRONT HTTP TESTS PASSED")
} finally {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
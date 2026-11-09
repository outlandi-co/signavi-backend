import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"

import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3StorefrontShippingQuoteRouter } from "../routes/v3StorefrontShippingQuote.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { verifyV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

const baseOrder = {
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
    variant: { color: "black", size: "L" }
  }]
}

const token = createGuestCheckoutToken(baseOrder)

const makeShipment = id => ({
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

let currentOrder = structuredClone(baseOrder)
let onCarrierRequest = () => {}
let carrierCalls = 0
let lookupCalls = 0

const app = express()
app.use(express.json())

app.use(
  "/api/v3/shipping",
  createV3StorefrontShippingQuoteRouter({
    findOrder: async id => {
      lookupCalls++
      if (id !== String(baseOrder._id)) return null
      return structuredClone(currentOrder)
    },
    getTrustedShipments: async () => {
      carrierCalls++
      onCarrierRequest()
      return [makeShipment(1), makeShipment(2)]
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

  const url =
    `http://127.0.0.1:${server.address().port}` +
    `/api/v3/shipping/${baseOrder._id}/quote`

  const request = async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-signavi-guest-checkout-token": token
      },
      body: JSON.stringify({})
    })

    return {
      status: response.status,
      data: await response.json()
    }
  }

  currentOrder = structuredClone(baseOrder)
  onCarrierRequest = () => {
    currentOrder.address.zip = "95341"
  }

  const changedAddress = await request()

  assert.equal(changedAddress.status, 409)
  assert.equal(changedAddress.data.success, false)
  assert.equal(changedAddress.data.shippingOptions, undefined)
  assert.equal(carrierCalls, 1)
  assert.equal(lookupCalls, 2)
  console.log("ADDRESS CHANGED DURING RATE REQUEST: PASS (409)")

  currentOrder = structuredClone(baseOrder)
  onCarrierRequest = () => {
    currentOrder.paymentStatus = "paid"
  }

  const becamePaid = await request()

  assert.equal(becamePaid.status, 409)
  assert.equal(becamePaid.data.shippingOptions, undefined)
  assert.equal(carrierCalls, 2)
  assert.equal(lookupCalls, 4)
  console.log("ORDER PAID DURING RATE REQUEST: PASS (409)")

  currentOrder = structuredClone(baseOrder)
  onCarrierRequest = () => {}

  const unchanged = await request()

  assert.equal(unchanged.status, 200)
  assert.equal(unchanged.data.success, true)
  assert.equal(unchanged.data.parcelCount, 2)
  assert.equal(unchanged.data.shippingOptions.length, 1)
  assert.equal(carrierCalls, 3)
  assert.equal(lookupCalls, 6)

  const option = unchanged.data.shippingOptions[0]
  const verified = verifyV3SignedQuote({
    token: option.signedQuote,
    cartFingerprint: createV3OrderFingerprint(baseOrder)
  })

  assert.ok(verified)
  assert.equal(verified.shippingAmountCents, 1200)
  console.log("UNCHANGED ORDER: PASS (200, SIGNED)")
  console.log("POST-CARRIER ORDER RELOAD: PASS")
  console.log("ALL V3 ORDER CHANGE RACE TESTS PASSED")
} finally {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}
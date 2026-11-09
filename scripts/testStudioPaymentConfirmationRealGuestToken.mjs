import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"

import {
  createGuestCheckoutToken,
  verifyGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

import {
  createStudioPaymentConfirmationHttpHandler
} from "../utils/createStudioPaymentConfirmationHttpHandler.mjs"

const id = "507f1f77bcf86cd799439011"
const attemptKey = "123e4567-e89b-42d3-a456-426614174000"

const originalSecret = process.env.SHIPPING_QUOTE_SECRET

// Test-only signing secret. Never use production credentials.
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

test.after(() => {
  if (originalSecret === undefined) {
    delete process.env.SHIPPING_QUOTE_SECRET
  } else {
    process.env.SHIPPING_QUOTE_SECRET = originalSecret
  }
})

function makeOrder(overrides = {}) {
  return {
    _id: id,
    storefront: "signavi_studio",
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    storefrontCreationAttemptKey: attemptKey,
    storefrontRecoveryProofHash: "NEVER_EXPOSE_PROOF",
    email: "private@example.invalid",
    ...overrides
  }
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      this.headers[name] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    }
  }
}

async function check({
  order,
  token,
  key = attemptKey
}) {
  const handler = createStudioPaymentConfirmationHttpHandler({
    findOrder: async () => order,
    verifyGuestToken: verifyGuestCheckoutToken
  })

  const req = {
    params: { id },
    get(name) {
      const headers = {
        "x-signavi-guest-checkout-token": token,
        "x-signavi-storefront-attempt-key": key
      }
      return headers[name.toLowerCase()]
    }
  }

  const res = makeResponse()
  await handler(req, res)
  return res
}

test("real token works before payment", async () => {
  const order = makeOrder()
  const token = createGuestCheckoutToken(order)

  assert.equal(verifyGuestCheckoutToken(order, token), true)

  const res = await check({ order, token })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.paymentStatus, "unpaid")
})

test("token issued while unpaid remains valid after paid", async () => {
  const order = makeOrder()
  const token = createGuestCheckoutToken(order)

  order.status = "paid"
  order.paymentStatus = "paid"

  assert.equal(
    verifyGuestCheckoutToken(order, token),
    true,
    "Guest token must remain valid after payment"
  )

  const res = await check({ order, token })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, {
    success: true,
    data: {
      orderId: id,
      storefront: "signavi_studio",
      paymentStatus: "paid"
    }
  })

  assert.equal(
    JSON.stringify(res.body).includes("NEVER_EXPOSE_PROOF"),
    false
  )
})

test("refunded status is represented accurately", async () => {
  const order = makeOrder()
  const token = createGuestCheckoutToken(order)

  order.status = "paid"
  order.paymentStatus = "refunded"

  const res = await check({ order, token })

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.paymentStatus, "refunded")
})

test("wrong guest token is rejected", async () => {
  const order = makeOrder()
  const res = await check({
    order,
    token: "invalid-token"
  })

  assert.equal(res.statusCode, 403)
})

test("valid token cannot confirm Signavi Store order", async () => {
  const order = makeOrder({
    storefront: "signavi_store"
  })
  const token = createGuestCheckoutToken(order)

  const res = await check({ order, token })

  assert.equal(res.statusCode, 403)
})

test("valid token with mismatched attempt is rejected", async () => {
  const order = makeOrder()
  const token = createGuestCheckoutToken(order)

  const res = await check({
    order,
    token,
    key: "123e4567-e89b-42d3-a456-426614174001"
  })

  assert.equal(res.statusCode, 403)
})
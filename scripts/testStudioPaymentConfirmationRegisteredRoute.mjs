import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import Order from "../models/Order.js"
import orderRoutes from "../routes/orders.js"

import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

const id = "507f1f77bcf86cd799439011"
const key = "123e4567-e89b-42d3-a456-426614174000"

test("registered Studio confirmation route", async (t) => {
  const originalFindById = Order.findById
  const originalSecret = process.env.SHIPPING_QUOTE_SECRET

  process.env.SHIPPING_QUOTE_SECRET =
    crypto.randomBytes(32).toString("hex")

  let server
  let reads = 0

  const order = {
    _id: id,
    storefront: "signavi_studio",
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    storefrontCreationAttemptKey: key,
    storefrontRecoveryProofHash: "PRIVATE_PROOF",
    storefrontCreationFingerprint: "PRIVATE_FINGERPRINT",
    squarePaymentId: "PRIVATE_PAYMENT_ID",
    email: "private@example.invalid"
  }

  try {
    Order.findById = async requestedId => {
      reads++
      return requestedId === id ? order : null
    }

    const token = createGuestCheckoutToken(order)
    const app = express()

    app.use("/api/orders", orderRoutes)

    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1")
      listener.once("listening", () => resolve(listener))
      listener.once("error", reject)
    })

    const base =
      `http://127.0.0.1:${server.address().port}/api/orders/`

    async function request({
      orderId = id,
      guestToken = token,
      attemptKey = key
    } = {}) {
      const response = await fetch(
        `${base}${orderId}/studio-payment-confirmation`,
        {
          headers: {
            "x-signavi-guest-checkout-token": guestToken,
            "x-signavi-storefront-attempt-key": attemptKey
          }
        }
      )

      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.json()
      }
    }

    await t.test("unpaid Studio confirmation", async () => {
      const result = await request()

      assert.equal(result.status, 200)
      assert.equal(result.body.data.paymentStatus, "unpaid")
      assert.equal(result.cacheControl, "no-store")
    })

    await t.test("paid Studio confirmation", async () => {
      order.status = "paid"
      order.paymentStatus = "paid"

      const result = await request()

      assert.equal(result.status, 200)
      assert.deepEqual(result.body, {
        success: true,
        data: {
          orderId: id,
          storefront: "signavi_studio",
          paymentStatus: "paid"
        }
      })

      const serialized = JSON.stringify(result.body)

      for (const value of [
        "PRIVATE_PROOF",
        "PRIVATE_FINGERPRINT",
        "PRIVATE_PAYMENT_ID",
        "private@example.invalid"
      ]) {
        assert.equal(serialized.includes(value), false)
      }
    })

    await t.test("invalid guest token rejected", async () => {
      const result = await request({
        guestToken: "invalid"
      })
      assert.equal(result.status, 403)
    })

    await t.test("missing guest token rejected before lookup", async () => {
      const before = reads

      const result = await request({
        guestToken: ""
      })

      assert.equal(result.status, 403)
      assert.equal(reads, before)
    })

    await t.test("different attempt rejected", async () => {
      const result = await request({
        attemptKey: "123e4567-e89b-42d3-a456-426614174001"
      })

      assert.equal(result.status, 403)
    })

    await t.test("different order rejected", async () => {
      const result = await request({
        orderId: "507f1f77bcf86cd799439012"
      })

      assert.equal(result.status, 403)
    })

    await t.test("Signavi Store order rejected", async () => {
      order.storefront = "signavi_store"

      try {
        const result = await request()
        assert.equal(result.status, 403)
      } finally {
        order.storefront = "signavi_studio"
      }
    })

    await t.test("refunded order not reported paid", async () => {
      order.paymentStatus = "refunded"

      const result = await request()

      assert.equal(result.status, 200)
      assert.equal(result.body.data.paymentStatus, "refunded")
    })

  } finally {
    Order.findById = originalFindById

    if (server) {
      server.closeAllConnections?.()

      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
    }

    if (originalSecret === undefined) {
      delete process.env.SHIPPING_QUOTE_SECRET
    } else {
      process.env.SHIPPING_QUOTE_SECRET = originalSecret
    }
  }
})
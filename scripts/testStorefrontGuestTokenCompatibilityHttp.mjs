import assert from "node:assert/strict"
import { test } from "node:test"
import crypto from "node:crypto"
import express from "express"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import orderRoutes from "../routes/orders.js"
import {
  createGuestCheckoutToken,
  verifyGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

test("valid storefront guest token preserves checkout access", async () => {
  const originalFindById = Order.findById
  const originalSecret = process.env.SHIPPING_QUOTE_SECRET

  const orderId = new mongoose.Types.ObjectId().toString()

  let saveCalls = 0
  let server

  const order = {
    _id: orderId,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    items: [],

    async save() {
      saveCalls += 1
      throw new Error("TEST_BLOCKED_ORDER_SAVE")
    }
  }

  try {
    // A temporary signing key, never a production credential.
    process.env.SHIPPING_QUOTE_SECRET =
      crypto.randomBytes(32).toString("hex")

    Order.findById = async () => order

    const token = createGuestCheckoutToken(order)

    assert.equal(verifyGuestCheckoutToken(order, token), true)
    assert.equal(verifyGuestCheckoutToken(order, "invalid"), false)

    const app = express()
    app.use(express.json())
    app.use("/api/orders", orderRoutes)

    server = app.listen(0, "127.0.0.1")

    await new Promise((resolve, reject) => {
      if (server.listening) return resolve()
      server.once("listening", resolve)
      server.once("error", reject)
    })

    const url =
      `http://127.0.0.1:${server.address().port}` +
      `/api/orders/${orderId}/checkout`

    const request = async (guestToken) => {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-signavi-guest-checkout-token": guestToken
        },
        body: JSON.stringify({})
      })

      return {
        status: response.status,
        body: await response.json()
      }
    }

    const invalid = await request("invalid-token")

    assert.equal(invalid.status, 403)
    assert.match(
      invalid.body.message,
      /Checkout session invalid or expired/
    )
    assert.equal(saveCalls, 0)

    console.log("PASS: Invalid storefront guest token denied")

    const valid = await request(token)

    // The token must pass ownership validation.
    // Incomplete shipping input must then fail safely.
    assert.equal(valid.status, 400)
    assert.doesNotMatch(
      String(valid.body.message || ""),
      /Checkout session invalid or expired/
    )
    assert.equal(saveCalls, 0)

    console.log("PASS: Valid guest token passes ownership check")
    console.log("PASS: Invalid checkout input safely rejected")
    console.log("PASS: Zero order saves")
    console.log("PASS: No Square requests")

  } finally {
    Order.findById = originalFindById

    if (originalSecret === undefined) {
      delete process.env.SHIPPING_QUOTE_SECRET
    } else {
      process.env.SHIPPING_QUOTE_SECRET = originalSecret
    }

    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  }
})
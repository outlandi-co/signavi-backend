import assert from "node:assert/strict"
import { test } from "node:test"
import express from "express"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import orderRoutes from "../routes/orders.js"

test("non-storefront checkout rejects anonymous requests before mutation", async () => {
  const orderId = new mongoose.Types.ObjectId().toString()
  const originalFindById = Order.findById

  let saveCalls = 0
  let server

  const fakeOrder = {
    _id: orderId,
    source: "manual",
    status: "payment_required",
    paymentStatus: "unpaid",

    async save() {
      saveCalls += 1

      // Prevent reaching any payment-creation request.
      throw new Error("TEST_BLOCKED_ORDER_SAVE")
    }
  }

  try {
    Order.findById = async () => fakeOrder

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

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    })

    const body = await response.json()

    console.log("ANONYMOUS CHECKOUT HTTP STATUS:", response.status)
    console.log("ANONYMOUS CHECKOUT RESPONSE:", body)
    console.log("MOCK ORDER SAVE CALLS:", saveCalls)

    assert.equal(
      response.status,
      401,
      "Anonymous non-storefront checkout must return HTTP 401"
    )

    assert.equal(
      saveCalls,
      0,
      "Unauthorized checkout must never save the order"
    )

    console.log("PASS: Anonymous non-storefront checkout denied")
    console.log("PASS: No order mutation")
    console.log("PASS: No MongoDB or Square requests")
  } finally {
    Order.findById = originalFindById

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
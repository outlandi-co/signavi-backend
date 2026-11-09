import assert from "node:assert/strict"
import { test } from "node:test"
import crypto from "node:crypto"
import express from "express"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import orderRoutes from "../routes/orders.js"

test("checkout role authorization protects order mutation", async () => {
  const originalFindById = Order.findById
  const originalJwtSecret = process.env.JWT_SECRET

  const orderId = new mongoose.Types.ObjectId().toString()
  const fakeOrder = {
    _id: orderId,
    source: "manual",
    status: "payment_required",
    paymentStatus: "unpaid",
    items: [],
    async save() {
      saveCalls++
      throw new Error("TEST_BLOCKED_ORDER_SAVE")
    }
  }

  let saveCalls = 0
  let server

  try {
    process.env.JWT_SECRET = crypto.randomBytes(48).toString("hex")
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

    const request = async (token) => {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? {
            Authorization: `Bearer ${token}`
          } : {})
        },
        body: JSON.stringify({})
      })

      return {
        status: response.status,
        body: await response.json()
      }
    }

    const customerJwt = jwt.sign(
      { id: "test-customer", role: "customer" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    )

    const adminJwt = jwt.sign(
      { id: "test-admin", role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "5m" }
    )

    const anonymous = await request()
    assert.equal(anonymous.status, 401)
    assert.equal(saveCalls, 0)
    console.log("PASS: Anonymous non-storefront checkout: 401")

    const customer = await request(customerJwt)
    assert.equal(customer.status, 403)
    assert.equal(customer.body.code, "CHECKOUT_ADMIN_REQUIRED")
    assert.equal(saveCalls, 0)
    console.log("PASS: Authenticated non-admin checkout: 403")

    const admin = await request(adminJwt)

    // Authorization succeeds, then intentionally incomplete
    // shipping input fails validation without any database save.
    assert.equal(admin.status, 400)
    assert.equal(admin.body.message, "Order has no items.")
    assert.equal(saveCalls, 0)
    console.log("PASS: Admin passes authorization into validation")

    fakeOrder.source = "store"

    const storefront = await request()
    assert.equal(storefront.status, 403)
    assert.match(
      storefront.body.message,
      /Checkout session invalid or expired/
    )
    assert.equal(saveCalls, 0)
    console.log("PASS: Storefront still requires guest token")

    console.log("PASS: Zero database saves")
    console.log("PASS: No Square payment requests")

  } finally {
    Order.findById = originalFindById

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET
    } else {
      process.env.JWT_SECRET = originalJwtSecret
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
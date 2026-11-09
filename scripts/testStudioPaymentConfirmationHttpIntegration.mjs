import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"

import {
  createGuestCheckoutToken,
  verifyGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"

import {
  createStudioPaymentConfirmationHttpHandler
} from "../utils/createStudioPaymentConfirmationHttpHandler.mjs"

const id = "507f1f77bcf86cd799439011"
const attemptKey = "123e4567-e89b-42d3-a456-426614174000"

test("Studio confirmation HTTP security contract", async (t) => {
  const previousSecret = process.env.SHIPPING_QUOTE_SECRET

  process.env.SHIPPING_QUOTE_SECRET =
    crypto.randomBytes(32).toString("hex")

  let server = null
  let lookupCount = 0

  const order = {
    _id: id,
    source: "store",
    storefront: "signavi_studio",
    status: "payment_required",
    paymentStatus: "unpaid",
    storefrontCreationAttemptKey: attemptKey,
    storefrontRecoveryProofHash: "PRIVATE_PROOF_NEVER_RETURN",
    storefrontCreationFingerprint: "PRIVATE_FINGERPRINT_NEVER_RETURN",
    squarePaymentId: "PRIVATE_SQUARE_ID_NEVER_RETURN",
    email: "private@example.invalid"
  }

  const initialOrder = { ...order }

  try {
    const token = createGuestCheckoutToken(order)

    const app = express()

    app.get(
      "/api/orders/:id/studio-payment-confirmation",
      createStudioPaymentConfirmationHttpHandler({
        findOrder: async (requestedId) => {
          lookupCount++
          return requestedId === id ? order : null
        },
        verifyGuestToken: verifyGuestCheckoutToken
      })
    )

    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1")
      listener.once("listening", () => resolve(listener))
      listener.once("error", reject)
    })

    const url =
      `http://127.0.0.1:${server.address().port}` +
      `/api/orders/${id}/studio-payment-confirmation`

    async function request({
      path = url,
      guestToken = token,
      key = attemptKey
    } = {}) {
      const response = await fetch(path, {
        method: "GET",
        headers: {
          "x-signavi-guest-checkout-token": guestToken,
          "x-signavi-storefront-attempt-key": key
        }
      })

      return {
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.json()
      }
    }

    await t.test("unpaid order responds without success claim", async () => {
      const result = await request()

      assert.equal(result.status, 200)
      assert.equal(result.body.data.paymentStatus, "unpaid")
      assert.equal(result.cacheControl, "no-store")
    })

    await t.test("same real token works after payment", async () => {
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

      const body = JSON.stringify(result.body)

      for (const privateValue of [
        "PRIVATE_PROOF_NEVER_RETURN",
        "PRIVATE_FINGERPRINT_NEVER_RETURN",
        "PRIVATE_SQUARE_ID_NEVER_RETURN",
        "private@example.invalid"
      ]) {
        assert.equal(body.includes(privateValue), false)
      }
    })

    await t.test("invalid guest token is denied", async () => {
      const result = await request({
        guestToken: "invalid-token"
      })

      assert.equal(result.status, 403)
      assert.equal(result.cacheControl, "no-store")
    })

    await t.test("missing guest token avoids lookup", async () => {
      const before = lookupCount
      const result = await request({ guestToken: "" })

      assert.equal(result.status, 403)
      assert.equal(lookupCount, before)
    })

    await t.test("wrong attempt key is denied", async () => {
      const result = await request({
        key: "123e4567-e89b-42d3-a456-426614174001"
      })

      assert.equal(result.status, 403)
    })

    await t.test("other-store order is denied", async () => {
      order.storefront = "signavi_store"

      try {
        const result = await request()
        assert.equal(result.status, 403)
      } finally {
        order.storefront = "signavi_studio"
      }
    })

    await t.test("wrong order ID is denied", async () => {
      const wrongUrl = url.replace(
        id,
        "507f1f77bcf86cd799439012"
      )

      const result = await request({ path: wrongUrl })

      assert.equal(result.status, 403)
    })

    await t.test("refunded order is not reported as paid", async () => {
      order.paymentStatus = "refunded"

      const result = await request()

      assert.equal(result.status, 200)
      assert.equal(result.body.data.paymentStatus, "refunded")
    })

    assert.equal(order._id, initialOrder._id)
    assert.equal(order.storefrontCreationAttemptKey,
      initialOrder.storefrontCreationAttemptKey)

  } finally {
    if (server) {
      server.closeAllConnections?.()

      await new Promise((resolve, reject) => {
        server.close((error) =>
          error ? reject(error) : resolve()
        )
      })
    }

    if (previousSecret === undefined) {
      delete process.env.SHIPPING_QUOTE_SECRET
    } else {
      process.env.SHIPPING_QUOTE_SECRET = previousSecret
    }
  }
})
import test from "node:test"
import assert from "node:assert/strict"
import express from "express"

import {
  denyV3ProductionCheckout
} from "../utils/denyV3ProductionCheckout.js"

const orderId = "507f1f77bcf86cd799439011"

test("V3 production denial is enforced over local HTTP", async () => {
  const app = express()
  app.use(express.json())

  let squareCalls = 0
  let reservationCalls = 0

  // Isolated HTTP harness, not the production orders router.
  app.patch("/api/orders/:id/checkout", (req, res) => {
    const gate = denyV3ProductionCheckout()

    assert.equal(req.params.id, orderId)

    return res.status(gate.httpStatus).json(gate.body)
  })

  const server = app.listen(0, "127.0.0.1")

  try {
    await new Promise((resolve, reject) => {
      if (server.listening) return resolve()
      server.once("listening", resolve)
      server.once("error", reject)
    })

    const address = server.address()

    assert.ok(address && typeof address !== "string")

    const url =
      `http://127.0.0.1:${address.port}` +
      `/api/orders/${orderId}/checkout`

    const requests = Array.from({ length: 12 }, (_, i) =>
      fetch(url, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-signavi-guest-checkout-token": `untrusted-${i}`
        },
        body: JSON.stringify({
          productionEnabled: true,
          squareRequestAuthorized: true,
          totalCents: 1
        })
      })
    )

    const responses = await Promise.all(requests)

    for (const response of responses) {
      assert.equal(response.status, 423)

      const body = await response.json()

      assert.equal(body.success, false)
      assert.equal(
        body.code,
        "V3_PRODUCTION_CHECKOUT_NOT_ACTIVATED"
      )
      assert.equal(body.paymentCreated, false)
      assert.equal(body.squareRequestAuthorized, false)
      assert.equal(body.retryAuthorized, false)
    }

    assert.equal(squareCalls, 0)
    assert.equal(reservationCalls, 0)

    console.log("PASS: 12 local HTTP requests returned 423")
    console.log("PASS: Client flags could not activate checkout")
    console.log("PASS: No Square or reservation callbacks invoked")
    console.log("NOTE: Full production orders router not exercised")
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error =>
        error ? reject(error) : resolve()
      )
    })
  }
})
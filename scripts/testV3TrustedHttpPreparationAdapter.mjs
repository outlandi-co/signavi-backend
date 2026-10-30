import assert from "node:assert/strict"
import test from "node:test"
import { createServer } from "node:http"

import {
  prepareV3TrustedHttpCheckout
} from "../utils/prepareV3TrustedHttpCheckout.js"

const ID = "507f1f77bcf86cd799439011"
const PURCHASE_KEY =
  `signavi-v3-production-purchase-${ID}`

function makeOrder() {
  return {
    _id: ID,
    status: "payment_required",
    paymentStatus: "unpaid",
    finalPrice: 25
  }
}

async function runHttpScenario({
  authorized = true,
  historicalClear = true,
  initializationValid = true,
  concurrency = 1
} = {}) {
  const calls = {
    authorization: 0,
    history: 0,
    initialization: 0,
    square: 0
  }

  const order = makeOrder()

  const server = createServer(async (req, res) => {
    if (
      req.method !== "POST" ||
      req.url !== "/checkout-preparation"
    ) {
      res.writeHead(404)
      res.end()
      return
    }

    try {
      const result = await prepareV3TrustedHttpCheckout({
        order,
        authorizeRequest: async () => {
          calls.authorization++
          return authorized
        },
        checkHistoricalPayment: async () => {
          calls.history++
          return {
            verified: historicalClear,
            noPriorPaymentActivity: historicalClear
          }
        },
        initializeCheckout: async ({ orderId }) => {
          calls.initialization++

          return {
            prepared: initializationValid,
            orderId,
            purchaseKey: PURCHASE_KEY
          }
        }
      })

      const status = result.ready
        ? 200
        : result.httpStatus || 423

      res.writeHead(status, {
        "content-type": "application/json"
      })
      res.end(JSON.stringify(result))
    } catch {
      res.writeHead(503, {
        "content-type": "application/json"
      })
      res.end(JSON.stringify({
        ready: false,
        squareRequestAuthorized: false
      }))
    }
  })

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", resolve)
    })

    const address = server.address()

    const url =
      `http://127.0.0.1:${address.port}/checkout-preparation`

    const results = await Promise.all(
      Array.from({ length: concurrency }, async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: "{}"
        })

        return {
          status: response.status,
          body: await response.json()
        }
      })
    )

    return { results, calls }
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeIdleConnections?.()
    })
  }
}

test("unauthorized HTTP checkout cannot initialize", async () => {
  const { results, calls } = await runHttpScenario({
    authorized: false
  })

  assert.equal(results[0].status, 403)
  assert.equal(results[0].body.ready, false)
  assert.equal(calls.history, 0)
  assert.equal(calls.initialization, 0)
  assert.equal(calls.square, 0)
})

test("uncleared historical payment blocks initialization", async () => {
  const { results, calls } = await runHttpScenario({
    historicalClear: false
  })

  assert.equal(results[0].status, 423)
  assert.equal(results[0].body.ready, false)
  assert.equal(calls.initialization, 0)
  assert.equal(calls.square, 0)
})

test("invalid initialization fails closed", async () => {
  const { results, calls } = await runHttpScenario({
    initializationValid: false
  })

  assert.equal(results[0].status, 423)
  assert.equal(results[0].body.ready, false)
  assert.equal(calls.square, 0)
})

test("authorized HTTP preparation never authorizes Square", async () => {
  const { results, calls } = await runHttpScenario()

  assert.equal(results[0].status, 200)
  assert.equal(results[0].body.ready, true)
  assert.equal(results[0].body.orderId, ID)
  assert.equal(
    results[0].body.purchaseKey,
    PURCHASE_KEY
  )
  assert.equal(
    results[0].body.squareRequestAuthorized,
    false
  )
  assert.equal(
    results[0].body.retryAuthorized,
    false
  )
  assert.equal(calls.square, 0)
})

test("concurrent preparation cannot invoke Square", async () => {
  const { results, calls } = await runHttpScenario({
    concurrency: 12
  })

  assert.equal(results.length, 12)
  assert.ok(
    results.every(result =>
      result.body.squareRequestAuthorized === false
    )
  )
  assert.equal(calls.square, 0)
})

console.log(
  "TEST-ONLY HTTP PREPARATION; NO SQUARE CLIENT OR DATABASE"
)
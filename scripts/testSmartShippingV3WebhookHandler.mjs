import assert from "node:assert/strict"
import crypto from "node:crypto"
import express from "express"
import vm from "node:vm"
import { readFileSync } from "node:fs"

import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"

import {
  verifyV3WebhookPaymentBinding
} from "../utils/smartShippingV3WebhookPaymentBinding.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const routeSource = readFileSync(
  new URL("../routes/squareWebhook.js", import.meta.url),
  "utf8"
)

// Execute the actual route implementation, without its imports.
// Every external dependency is supplied by this synthetic harness.
const start = routeSource.indexOf("const router = express.Router()")
const end = routeSource.lastIndexOf("export default router")

assert.ok(start >= 0 && end > start, "Route boundaries missing")

const routeBody = routeSource.slice(start, end)

const orderId = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({
  orderId
})

const signatureKey = "synthetic-test-signature-key"
const notificationUrl = "https://synthetic.invalid/webhook"
const locationId = "synthetic-location"

const makeOrder = () => ({
  _id: orderId,
  status: "payment_required",
  paymentStatus: "unpaid",
  squareEnvironment: "sandbox",
  squareExpectedAmountCents: 100,
  currency: "USD",
  squareOrderId: "",
  squarePaymentId: "",
  squarePaymentLinkId: "",
  paymentUrl: "",
  timeline: []
})

const operation = {
  orderId,
  environment: "sandbox",
  status: "completed",
  requestOwner: "synthetic-owner",
  idempotencyKey: "signavi-v3-sandbox-synthetic",
  checkoutReferenceId: reference,
  amountCents: 100,
  squarePaymentLinkId: "synthetic-link",
  squareOrderId: "synthetic-square-order",
  paymentUrl: "https://sandbox.square.link/u/synthetic"
}

const payment = {
  id: "synthetic-payment",
  status: "COMPLETED",
  order_id: "synthetic-square-order",
  location_id: locationId,
  amount_money: {
    amount: 100,
    currency: "USD"
  }
}

const squareOrder = {
  id: "synthetic-square-order",
  reference_id: reference,
  location_id: locationId,
  total_money: {
    amount: 100,
    currency: "USD"
  }
}

const setup = ({
  initialOrder = makeOrder(),
  paymentOverride = {},
  squareOrderOverride = {},
  operationOverride = {},
  invoiceMatches = [], beforeAtomicUpdate = null
} = {}) => {
  let handler
  let paidUpdates = 0
  let squareLookups = 0
  let invoiceUpdates = 0

  const local = structuredClone(initialOrder)
  const verifiedPayment = {
    ...structuredClone(payment),
    ...paymentOverride
  }
  const verifiedOrder = {
    ...structuredClone(squareOrder),
    ...squareOrderOverride
  }

  const Order = {
    findOne: async query => {
      return query.squareOrderId === local.squareOrderId &&
        !!local.squareOrderId
        ? local
        : null
    },
    findById: async id =>
      String(id) === String(local._id) ? local : null,
    findOneAndUpdate: async (query, mutation) => {
      // Assert that the real route passes an atomic paid-state filter.
      assert.ok(
        query.paymentStatus?.$nin?.includes("paid"),
        "Atomic filter must exclude paid orders"
      )
      assert.ok(
        query.paymentStatus?.$nin?.includes("refunded"),
        "Atomic filter must exclude refunded orders"
      )
      assert.ok(
        query.status?.$nin?.includes("cancelled"),
        "Atomic filter must exclude closed orders"
      )
      assert.ok(
        query.squarePaymentId?.$in?.includes(verifiedPayment.id),
        "Atomic filter must bind the payment identity"
      )
      assert.equal(
        query.squareEnvironment,
        "sandbox",
        "Atomic filter must bind Sandbox environment"
      )

      // Simulate another delivery committing just before this update.
      if (beforeAtomicUpdate) {
        beforeAtomicUpdate(local)
      }

      // This mock deliberately checks the critical compare-and-set
      // conditions instead of blindly accepting every update.
      if (
        String(query._id) !== String(local._id) ||
        local.paymentStatus === "paid" ||
        local.paymentStatus === "refunded" ||
        local.squareEnvironment !== query.squareEnvironment ||
        (local.squarePaymentId &&
          local.squarePaymentId !== verifiedPayment.id) ||
        (local.squareOrderId &&
          local.squareOrderId !== verifiedOrder.id)
      ) {
        return null
      }

      paidUpdates++
      Object.assign(local, mutation.$set)
      if (mutation.$push?.timeline) {
        local.timeline.push(mutation.$push.timeline)
      }
      return local
    },
    updateOne: async () => {
      throw new Error("Unexpected receipt update")
    }
  }

  const Invoice = {
    find: () => ({
      limit: async () => invoiceMatches
    }),
    findOneAndUpdate: async () => {
      invoiceUpdates++
      throw new Error("Invoice update requires separate fixture")
    },
    findById: async () => null
  }

  const PaymentOperation = {
    findOne: () => ({
      lean: async () => ({
        ...structuredClone(operation),
        ...operationOverride
      })
    })
  }

  const mockedFetch = async url => {
    squareLookups++
    if (url.endsWith("/v2/payments/synthetic-payment")) {
      return {
        ok: true,
        json: async () => ({ payment: verifiedPayment })
      }
    }
    if (url.endsWith("/v2/orders/synthetic-square-order")) {
      return {
        ok: true,
        json: async () => ({ order: verifiedOrder })
      }
    }
    throw new Error("Unexpected external endpoint: " + url)
  }

  const router = {
    post: (path, callback) => {
      assert.equal(path, "/webhook")
      handler = callback
    }
  }

  const context = {
    express: { Router: () => router },
    crypto,
    fetch: mockedFetch,
    Order,
    Quote: {
      findById: () => ({
        select: async () => null
      })
    },
    Invoice,
    Notification: {
      create: async () => {
        throw new Error("Notifications disabled in test")
      }
    },
    SmartShippingV3PaymentOperation: PaymentOperation,
    // Synthetic credentials for the isolated webhook VM.
    getSquareAccessToken: () => "synthetic-sandbox-token",
    getSquareLocationId: () => locationId,
    sendReceiptEmail: async () => {
      throw new Error("Receipts disabled in test")
    },
    parseV3WebhookOrderReference,
    verifyV3WebhookPaymentBinding,
    process: {
      env: {
        SQUARE_ENVIRONMENT: "sandbox",
        SQUARE_WEBHOOK_SIGNATURE_KEY: signatureKey,
        SQUARE_WEBHOOK_URL: notificationUrl,
        SQUARE_ACCESS_TOKEN: "synthetic-test-token",
        SQUARE_LOCATION_ID: locationId
      }
    },
    Buffer,
    AbortSignal,
    Date,
    console: {
      log() {},
      warn() {},
      error() {}
    }
  }

  vm.runInNewContext(routeBody, context, {
    filename: "squareWebhook-isolated-test.js",
    timeout: 2000
  })

  assert.equal(typeof handler, "function")

  const deliver = async ({
    validSignature = true,
    eventType = "payment.updated"
  } = {}) => {
    const event = {
      type: eventType,
      data: {
        object: {
          payment: {
            id: "synthetic-payment",
            status: "COMPLETED"
          }
        }
      }
    }

    const body = Buffer.from(JSON.stringify(event))

    const signature = crypto
      .createHmac("sha256", signatureKey)
      .update(notificationUrl, "utf8")
      .update(body)
      .digest("base64")

    let statusCode = null

    const req = {
      body,
      headers: {
        "x-square-hmacsha256-signature":
          validSignature ? signature : "invalid-signature"
      },
      app: { get: () => null }
    }

    const res = {
      sendStatus: code => {
        statusCode = code
        return res
      }
    }

    await handler(req, res)

    assert.ok(statusCode !== null, "No response status")

    return statusCode
  }

  return {
    deliver,
    local,
    get handler() { return handler },
    get paidUpdates() { return paidUpdates },
    get squareLookups() { return squareLookups },
    get invoiceUpdates() { return invoiceUpdates }
  }
}

// First payment must transition only once.
{
  const test = setup()
  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 1)
  assert.equal(test.local.paymentStatus, "paid")
  assert.equal(test.local.squarePaymentId, payment.id)
  console.log("SIGNED FIRST V3 PAYMENT: PASS")

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 1)
  assert.equal(test.local.timeline.length, 1)
  console.log("EXACT DUPLICATE HAS NO SECOND WRITE: PASS")
}

// An unsigned or incorrectly signed webhook must stop before Square.
{
  const test = setup()
  assert.equal(
    await test.deliver({ validSignature: false }),
    401
  )
  assert.equal(test.squareLookups, 0)
  assert.equal(test.paidUpdates, 0)
  console.log("INVALID SIGNATURE: REJECTED")
}

// A mismatched V3 Square payment must not mutate the order.
{
  const test = setup({
    paymentOverride: {
      amount_money: { amount: 200, currency: "USD" }
    },
    squareOrderOverride: {
      total_money: { amount: 200, currency: "USD" }
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("WRONG V3 AMOUNT: NO WRITE")
}

// The V3 operation must be associated with the same Square order.
{
  const test = setup({
    operationOverride: {
      squareOrderId: "different-square-order"
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("CONFLICTING V3 OPERATION: NO WRITE")
}

// A canonical reference for another order cannot rebind this order.
{
  const test = setup({
    squareOrderOverride: {
      reference_id: createV3SquareSafeCheckoutReference({
        orderId: "507f191e810c19729de860eb"
      })
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("V3 REFERENCE COLLISION: NO WRITE")
}

// An irrelevant event must not look up Square or update the DB.
{
  const test = setup()
  assert.equal(
    await test.deliver({ eventType: "inventory.updated" }),
    200
  )
  assert.equal(test.squareLookups, 0)
  assert.equal(test.paidUpdates, 0)
  console.log("UNRELATED EVENT: IGNORED")
}

// Reject a Square payment associated with another location.
{
  const test = setup({
    paymentOverride: {
      location_id: "incorrect-location"
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("WRONG PAYMENT LOCATION: NO WRITE")
}

// Reject inconsistent currency even when amounts match.
{
  const test = setup({
    paymentOverride: {
      amount_money: { amount: 100, currency: "EUR" }
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("WRONG PAYMENT CURRENCY: NO WRITE")
}

// An unfinished link-creation operation cannot confirm payment.
{
  const test = setup({
    operationOverride: {
      status: "reconciliation_required"
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("UNFINISHED V3 OPERATION: NO WRITE")
}

// A saved conflicting payment ID must block reconciliation.
{
  const initialOrder = makeOrder()
  initialOrder.squarePaymentId = "different-payment"

  const test = setup({ initialOrder })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  console.log("CONFLICTING SAVED PAYMENT: NO WRITE")
}

// An already-paid order cannot accept a different Square payment.
{
  const initialOrder = makeOrder()
  initialOrder.status = "paid"
  initialOrder.paymentStatus = "paid"
  initialOrder.squareOrderId = squareOrder.id
  initialOrder.squarePaymentId = "different-payment"

  const test = setup({ initialOrder })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  assert.equal(test.local.squarePaymentId, "different-payment")
  console.log("CONFLICTING PAID REPLAY: NO WRITE")
}

// If a Square order identifies both an invoice and storefront order,
// neither payment path is permitted to update its record.
{
  const test = setup({
    invoiceMatches: [{
      _id: "507f191e810c19729de860ec",
      squareOrderId: squareOrder.id,
      squareEnvironment: "sandbox",
      total: 1,
      paymentStatus: "unpaid"
    }]
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  assert.equal(test.invoiceUpdates, 0)
  assert.equal(test.local.paymentStatus, "unpaid")
  console.log("LEGACY INVOICE COLLISION: NO WRITE")
}

console.log("ALL 6 ADDITIONAL WEBHOOK BOUNDARIES: PASS")
// Another delivery wins the same payment immediately before our update.
{
  const test = setup({
    beforeAtomicUpdate: local => {
      local.status = "paid"
      local.paymentStatus = "paid"
      local.squarePaymentId = payment.id
      local.squareOrderId = squareOrder.id
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  assert.equal(test.local.paymentStatus, "paid")
  assert.equal(test.local.squarePaymentId, payment.id)

  console.log("CONCURRENT SAME PAYMENT: NO SECOND WRITE")
}

// Another delivery wins with a conflicting payment identity.
{
  const test = setup({
    beforeAtomicUpdate: local => {
      local.status = "paid"
      local.paymentStatus = "paid"
      local.squarePaymentId = "competing-payment"
      local.squareOrderId = squareOrder.id
    }
  })

  assert.equal(await test.deliver(), 200)
  assert.equal(test.paidUpdates, 0)
  assert.equal(test.local.squarePaymentId, "competing-payment")

  console.log("CONCURRENT CONFLICTING PAYMENT: NO WRITE")
}

console.log("ATOMIC QUERY FILTER ASSERTIONS: PASS")
console.log("SYNTHETIC WEBHOOK HANDLER SCENARIOS: PASS")
console.log("DATABASE METHODS: MOCKED")
console.log("SQUARE RESPONSES: MOCKED")
console.log("NO REAL HTTP REQUESTS")
console.log("NO DATABASE CONNECTION")

// Exercise the actual Express request transport with synthetic credentials.
// Square API responses and database methods remain mocked in setup().
{
  const test = setup()
  const app = express()

  app.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    test.handler
  )

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s))
    s.once("error", reject)
  })

  try {
    const address = server.address()
    assert.ok(address && typeof address !== "string")

    const url = `http://127.0.0.1:${address.port}/webhook`

    const deliverHttp = async (validSignature = true) => {
      const event = {
        type: "payment.updated",
        data: {
          object: {
            payment: {
              id: "synthetic-payment",
              status: "COMPLETED"
            }
          }
        }
      }

      const body = JSON.stringify(event)

      const signature = crypto
        .createHmac("sha256", signatureKey)
        .update(notificationUrl, "utf8")
        .update(Buffer.from(body))
        .digest("base64")

      const response = await globalThis.fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-square-hmacsha256-signature":
            validSignature ? signature : "invalid-signature"
        },
        body,
        signal: AbortSignal.timeout(5000)
      })

      return response.status
    }

    assert.equal(await deliverHttp(false), 401)
    assert.equal(test.paidUpdates, 0)
    assert.equal(test.squareLookups, 0)
    console.log("EXPRESS INVALID SIGNATURE: REJECTED")

    assert.equal(await deliverHttp(true), 200)
    assert.equal(test.paidUpdates, 1)
    assert.equal(test.local.paymentStatus, "paid")
    console.log("EXPRESS SIGNED PAYMENT: PASS")

    assert.equal(await deliverHttp(true), 200)
    assert.equal(test.paidUpdates, 1)
    assert.equal(test.local.timeline.length, 1)
    console.log("EXPRESS DUPLICATE DELIVERY: NO SECOND WRITE")

    console.log("LOCAL EXPRESS HTTP WEBHOOK TESTS: PASS")
  } finally {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
}
console.log("NO PAYMENT CREATION")
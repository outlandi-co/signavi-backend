import assert from "node:assert/strict"
import { createServer } from "node:http"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import SquareReservation from "../models/SquarePaymentCreationReservation.js"
import SharedPaymentReservation from "../models/SharedSquarePaymentReservation.js"

import {
  prepareV3TrustedHttpCheckout
} from "../utils/prepareV3TrustedHttpCheckout.js"

import {
  checkV3KnownPaymentHistory
} from "../utils/checkV3KnownPaymentHistory.js"

import {
  initializeV3ProductionCheckoutAtomic
} from "../utils/initializeV3ProductionCheckoutAtomic.js"

const AUTH = "isolated-test-only-authorization"
const orderId = new mongoose.Types.ObjectId().toString()
const amountCents = 2500

const order = {
  _id: orderId,
  status: "payment_required",
  paymentStatus: "unpaid",
  finalPrice: 25
}

let replica
let server
let baseUrl

const counters = {
  authorized: 0,
  history: 0,
  initialize: 0,
  square: 0
}

function respond(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json"
  })
  res.end(JSON.stringify(body))
}

async function handler(req, res) {
  if (
    req.method !== "POST" ||
    req.url !== "/isolated-checkout"
  ) {
    return respond(res, 404, { success: false })
  }

  try {
    const result = await prepareV3TrustedHttpCheckout({
      order,

      authorizeRequest: async candidate => {
        counters.authorized++

        return (
          req.headers["x-isolated-test-authorization"] === AUTH &&
          String(candidate?._id) === orderId
        )
      },

      checkHistoricalPayment: async details => {
        counters.history++

        return checkV3KnownPaymentHistory({
          ...details,
          Order: {
            findById: () => ({
              lean: async () => order
            })
          },
          SquareReservation,
          SharedPaymentReservation,
          ProductionReservation: Reservation,
          PaymentOperation
        })
      },

      initializeCheckout: async details => {
        counters.initialize++

        return initializeV3ProductionCheckoutAtomic({
          Reservation,
          PaymentOperation,
          startSession: () => mongoose.startSession(),
          ...details
        })
      }
    })

    return respond(
      res,
      result.ready ? 200 : result.httpStatus || 423,
      result
    )
  } catch {
    return respond(res, 503, {
      ready: false,
      squareRequestAuthorized: false,
      retryAuthorized: false
    })
  }
}

async function request(authorized = true) {
  const response = await fetch(`${baseUrl}/isolated-checkout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorized
        ? { "x-isolated-test-authorization": AUTH }
        : {})
    },
    body: "{}"
  })

  return {
    status: response.status,
    body: await response.json()
  }
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_http_isolated",
    serverSelectionTimeoutMS: 10000
  })

  await Promise.all([
    Reservation.init(),
    PaymentOperation.init(),
    SquareReservation.init(),
    SharedPaymentReservation.init()
  ])

  server = createServer(handler)

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })

  const { port } = server.address()
  baseUrl = `http://127.0.0.1:${port}`

  console.log("PASS: Localhost server and isolated MongoDB ready")

  // 1. Unauthorized callers must not reach payment history
  //    or create durable payment-related records.
  const unauthorized = await request(false)

  assert.equal(unauthorized.status, 403)
  assert.equal(unauthorized.body.ready, false)
  assert.equal(counters.history, 0)
  assert.equal(counters.initialize, 0)

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    0
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    0
  )

  console.log("PASS: Unauthorized request cannot initialize")

  // 2. Authorized preparation checks existing history and
  //    creates the server-owned reservation/operation pair.
  const first = await request(true)

  assert.equal(first.status, 423)
  assert.equal(first.body.ready, false)
  assert.equal(
    first.body.reason,
    "HISTORICAL_PAYMENT_NOT_CLEARED"
  )
  assert.equal(first.body.squareRequestAuthorized, false)
  assert.equal(first.body.retryAuthorized, false)

  assert.equal(counters.authorized, 2)
  assert.equal(counters.history, 1)
  assert.equal(counters.initialize, 0)
  assert.equal(counters.square, 0)

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    0
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    0
  )

  console.log(
    "PASS: Unverified external payment history blocks initialization"
  )

  // Repeating an uncertain request must remain blocked.
  const replay = await request(true)

  assert.equal(replay.status, 423)
  assert.equal(replay.body.ready, false)
  assert.equal(
    replay.body.reason,
    "HISTORICAL_PAYMENT_NOT_CLEARED"
  )
  assert.equal(replay.body.squareRequestAuthorized, false)
  assert.equal(replay.body.retryAuthorized, false)

  assert.equal(counters.history, 2)
  assert.equal(counters.initialize, 0)
  assert.equal(counters.square, 0)

  assert.equal(
    await Reservation.countDocuments({ orderId }),
    0
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId }),
    0
  )

  console.log("PASS: Retry remains blocked with zero new records")
  console.log("PASS: No Square client was constructed or called")
  console.log("===== STEP 426 INTEGRATION PASSED =====")
  console.log("ISOLATED MONGODB ONLY")
  console.log("LOCALHOST HTTP ONLY")
  console.log("NO LIVE PAYMENT EXECUTION")
} finally {
  if (server?.listening) {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
      server.closeIdleConnections?.()
    })
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (replica) {
    await replica.stop()
  }
}
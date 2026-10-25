import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  acquireV3CheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  reserveV3SquareRequest
} from "../utils/smartShippingV3ReserveSquareRequest.js"

import {
  claimV3SquareCreationAttempt
} from "../utils/smartShippingV3ClaimCreationAttempt.js"

const databaseName = "signavi_shipping_v3_dev"

if (
  !["test", "development"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Isolated Sandbox test environment required.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const reference = createV3SquareSafeCheckoutReference({ orderId })
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

let connected = false
let lock = null

try {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName
  )

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "pending",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 5528,
    squarePaymentLinkId: ""
  })

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 5528,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId: reference,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  lock = await acquireV3CheckoutLock(orderId)
  assert.ok(lock?.owner)

  const reservation = await reserveV3SquareRequest({
    orderId,
    owner: lock.owner
  })

  assert.equal(reservation.requestReserved, true)

  await assert.rejects(
    claimV3SquareCreationAttempt({
      orderId,
      owner: "wrong-owner",
      idempotencyKey: key
    })
  )

  let operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(
    operation.squareCreationAttemptClaimedAt ?? null,
    null
  )

  console.log("WRONG OWNER BLOCKED: PASS")

  const firstRace = await Promise.allSettled([
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    }),
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  ])

  const winners = firstRace.filter(
    result => result.status === "fulfilled"
  )

  const losers = firstRace.filter(
    result => result.status === "rejected"
  )

  assert.equal(winners.length, 1)
  assert.equal(losers.length, 1)

  console.log("INITIAL CONCURRENT CLAIM RACE: PASS")

  const claim = winners[0].value

  assert.equal(claim.claimed, true)
  assert.equal(claim.amountCents, 5528)
  assert.equal(claim.idempotencyKey, key)
  assert.equal(claim.squareRequestAuthorized, false)

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.ok(operation.squareCreationAttemptClaimedAt)
  assert.equal(operation.status, "reconciliation_required")

  console.log("DURABLE CLAIM PERSISTED: PASS")

  await assert.rejects(
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  )

  console.log("REPEATED CLAIM BLOCKED: PASS")

  const concurrent = await Promise.allSettled([
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    }),
    claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })
  ])

  assert.equal(
    concurrent.filter(result => result.status === "fulfilled").length,
    0
  )

  console.log("CONCURRENT DUPLICATE CLAIMS BLOCKED: PASS")

  operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.ok(operation.squareCreationAttemptClaimedAt)
  assert.equal(operation.squarePaymentLinkId, "")
  assert.equal(operation.paymentUrl, "")

  console.log("CLAIM SURVIVES SUBSEQUENT CALLS: PASS")
  console.log("NO SQUARE CREATION: PASS")
  console.log("ALL DURABLE CLAIM TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (
        mongoose.connection.db.databaseName === databaseName
      ) {
        await mongoose.connection
          .collection("smart_shipping_v3_checkout_locks")
          .deleteOne({
            _id: id,
            ...(lock?.owner ? { owner: lock.owner } : {})
          })

        await PaymentOperation.collection.deleteOne({
          orderId: id,
          idempotencyKey: key
        })

        await Order.collection.deleteOne({ _id: id })

        console.log("ISOLATED FIXTURES CLEANED")
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}

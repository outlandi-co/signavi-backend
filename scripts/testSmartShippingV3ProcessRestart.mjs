import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

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

const dbName = "signavi_shipping_v3_dev"
const script = fileURLToPath(import.meta.url)

if (
  !["test", "development"].includes(process.env.NODE_ENV) ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  !process.env.MONGO_URI
) {
  throw new Error("STOP: Isolated Sandbox settings required.")
}

const connect = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(mongoose.connection.db.databaseName, dbName)
}

// Child process: attempt to claim an already-claimed
// operation, without running any Square creation.
if (process.argv[2] === "--probe") {
  const [orderId, owner, key] = process.argv.slice(3)

  try {
    await connect()

    const operation = await PaymentOperation.findOne({
      orderId
    }).lean()

    assert.equal(operation.status, "reconciliation_required")
    assert.ok(operation.squareCreationAttemptClaimedAt)

    await assert.rejects(
      claimV3SquareCreationAttempt({
        orderId,
        owner,
        idempotencyKey: key
      })
    )

    console.log("NEW PROCESS SEES DURABLE CLAIM: PASS")
    console.log("NEW PROCESS CANNOT RECLAIM: PASS")
  } catch (error) {
    console.error("RESTART PROBE FAILED:", error.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
} else {
  const id = new mongoose.Types.ObjectId()
  const orderId = String(id)
  const key = `signavi-v3-sandbox-${crypto.randomUUID()}`
  const reference = createV3SquareSafeCheckoutReference({ orderId })

  let connected = false
  let lock

  try {
    await connect()
    connected = true

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

    const reserved = await reserveV3SquareRequest({
      orderId,
      owner: lock.owner
    })

    assert.equal(reserved.requestReserved, true)

    const claim = await claimV3SquareCreationAttempt({
      orderId,
      owner: lock.owner,
      idempotencyKey: key
    })

    assert.equal(claim.claimed, true)
    console.log("PARENT PROCESS DURABLY CLAIMED: PASS")

    // Parent stays connected; child has its own
    // Node process and separate MongoDB connection.
    const result = spawnSync(
      process.execPath,
      [script, "--probe", orderId, lock.owner, key],
      {
        env: {
          ...process.env,
          NODE_ENV: "test",
          SQUARE_ENVIRONMENT: "sandbox",
          SMART_SHIPPING_V3_ENABLED: "true",
          SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false"
        },
        encoding: "utf8",
        timeout: 20000
      }
    )

    if (result.stdout) process.stdout.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    if (result.error) throw result.error

    assert.equal(result.status, 0)
    console.log("SEPARATE-PROCESS RESTART PROTECTION: PASS")

    const operation = await PaymentOperation.findOne({
      orderId
    }).lean()

    assert.equal(operation.status, "reconciliation_required")
    assert.ok(operation.squareCreationAttemptClaimedAt)
    assert.equal(operation.squarePaymentLinkId, "")

    const order = await Order.collection.findOne({
      _id: id
    })

    assert.notEqual(
      String(order.paymentStatus).toLowerCase(),
      "paid"
    )

    console.log("RECONCILIATION STATE PRESERVED: PASS")
    console.log("CUSTOMER ORDER REMAINS UNPAID: PASS")
    console.log("ZERO SQUARE REQUESTS: PASS")
    console.log("ALL PROCESS RESTART TESTS PASSED")
  } finally {
    try {
      if (
        connected &&
        mongoose.connection.db.databaseName === dbName
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
      if (connected) await mongoose.disconnect()
    }
  }
}

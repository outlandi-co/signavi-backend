import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  assessV3CheckoutRecovery
} from "../utils/smartShippingV3RecoveryAssessment.js"

const dbName = "signavi_shipping_v3_dev"
const locksCollection = "smart_shipping_v3_checkout_locks"
const now = new Date("2026-10-23T12:00:00.000Z")
const ids = []

process.env.NODE_ENV = "development"
process.env.SQUARE_ENVIRONMENT = "sandbox"

let connected = false

const createCase = async ({
  withLock = true,
  withOperation = true,
  expired = false,
  operationChanges = {}
} = {}) => {
  const id = new mongoose.Types.ObjectId()
  ids.push(id)

  if (withOperation) {
    await PaymentOperation.create({
      orderId: id,
      idempotencyKey:
        `signavi-v3-sandbox-${crypto.randomUUID()}`,
      checkoutReferenceId:
        `signavi-v3-sandbox-${String(id)}`,
      amountCents: 5528,
      environment: "sandbox",
      status: "pending",
      requestOwner: "",
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      ...operationChanges
    })
  }

  if (withLock) {
    await mongoose.connection
      .collection(locksCollection)
      .insertOne({
        _id: id,
        owner: crypto.randomUUID(),
        expiresAt: new Date(
          now.getTime() + (expired ? -60000 : 60000)
        ),
        createdAt: new Date(now.getTime() - 120000)
      })
  }

  return id
}

const check = async (id, expectedReason, candidate = false) => {
  const locks = mongoose.connection.collection(locksCollection)

  const beforeLock = await locks.findOne({ _id: id })
  const beforeOperation = await PaymentOperation.findOne({
    orderId: id
  }).lean()

  const result = await assessV3CheckoutRecovery({
    orderId: id,
    now
  })

  assert.equal(result.orderId, String(id))
  assert.equal(result.reason, expectedReason)
  assert.equal(result.recoveryCandidate, candidate)
  assert.equal(result.lockReleaseAuthorized, false)
  assert.equal(result.squareRequestAuthorized, false)

  assert.deepEqual(
    await locks.findOne({ _id: id }),
    beforeLock
  )

  assert.deepEqual(
    await PaymentOperation.findOne({
      orderId: id
    }).lean(),
    beforeOperation
  )

  console.log(`${expectedReason}: PASS`)
}

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED V3 DATABASE: PASS")

  await check(
    await createCase({
      withLock: false,
      withOperation: false
    }),
    "no_preparation"
  )

  await check(
    await createCase({ withLock: false }),
    "missing_lock_requires_review"
  )

  await check(
    await createCase({ withOperation: false }),
    "missing_operation_requires_review"
  )

  await check(
    await createCase(),
    "active_preparation"
  )

  await check(
    await createCase({ expired: true }),
    "expired_unstarted_candidate",
    true
  )

  await check(
    await createCase({
      expired: true,
      operationChanges: {
        status: "reconciliation_required",
        requestOwner: "payment-started-owner"
      }
    }),
    "payment_state_requires_reconciliation"
  )

  await check(
    await createCase({
      expired: true,
      operationChanges: {
        status: "completed",
        squarePaymentLinkId: "sandbox-link-test"
      }
    }),
    "payment_state_requires_reconciliation"
  )

  await check(
    await createCase({
      expired: true,
      operationChanges: {
        squareOrderId: "sandbox-order-test"
      }
    }),
    "payment_state_requires_reconciliation"
  )

  await assert.rejects(
    assessV3CheckoutRecovery({
      orderId: "invalid-order-id",
      now
    }),
    /Invalid V3 recovery order ID/
  )

  console.log("INVALID ORDER ID REJECTED: PASS")

  const originalEnvironment = process.env.SQUARE_ENVIRONMENT

  try {
    process.env.SQUARE_ENVIRONMENT = "production"

    await assert.rejects(
      assessV3CheckoutRecovery({
        orderId: ids[0],
        now
      }),
      /requires development Sandbox/
    )

    console.log("NON-SANDBOX ASSESSMENT BLOCKED: PASS")
  } finally {
    process.env.SQUARE_ENVIRONMENT = originalEnvironment
  }

  console.log("ASSESSMENT DATABASE IMMUTABILITY: PASS")
  console.log("NO LOCK RELEASE AUTHORIZED: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
  console.log("ALL V3 RECOVERY ASSESSMENT TESTS PASSED")

} catch (error) {
  console.error(
    "V3 RECOVERY ASSESSMENT TEST FAILED:",
    error
  )

  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({
        orderId: { $in: ids }
      })

      await mongoose.connection
        .collection(locksCollection)
        .deleteMany({ _id: { $in: ids } })

      console.log("CLEANUP: Temporary test records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error)
      process.exitCode = 1
    }
  }

  if (connected) {
    await mongoose.disconnect()
  }
}
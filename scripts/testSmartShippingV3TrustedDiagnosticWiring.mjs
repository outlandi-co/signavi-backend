import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import { SquareError, SquareTimeoutError } from "square"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  runV3TrustedSandboxExecutionForTests
} from "../utils/smartShippingV3TrustedExecution.js"

const database = "signavi_shipping_v3_dev"

const flags = [
  "NODE_ENV",
  "SQUARE_ENVIRONMENT",
  "SMART_SHIPPING_V3_ENABLED",
  "SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED"
]

const original = Object.fromEntries(
  flags.map(key => [key, process.env[key]])
)

const restore = () => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

let connected = false

const runCase = async ({
  name,
  makeError,
  expectPersisted,
  existingDiagnostic = null
}) => {
  const orderId = new mongoose.Types.ObjectId()
  const id = String(orderId)
  const owner = `trusted-diag-test-${crypto.randomUUID()}`
  const idempotencyKey = `signavi-v3-sandbox-${id}`

  let created = false
  let createCalls = 0
  let lookupCalls = 0

  try {
    await PaymentOperation.create({
      orderId,
      checkoutReferenceId:
        createV3SquareSafeCheckoutReference({ orderId: id }),
      idempotencyKey,
      amountCents: 100,
      environment: "sandbox",
      status: "reconciliation_required",
      requestOwner: owner,
      squareCreationAttemptClaimedAt: null,
      squarePaymentLinkId: "",
      squareOrderId: "",
      paymentUrl: "",
      lastError: "Square outcome not yet confirmed.",
      squareDiagnostic: existingDiagnostic
    })

    created = true

    // The durable creation claim requires the checkout
    // lock to have the same order ID and owner.
    const locks = mongoose.connection.collection(
      "smart_shipping_v3_checkout_locks"
    )

    await locks.insertOne({
      _id: orderId,
      owner,
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      ownershipChecks: 0
    })

    const sdk = {
      merchantId: "mock-merchant",
      locationId: "mock-location",

      verifyIdentity: async () => ({
        verified: true,
        squareRequestAuthorized: false,
        merchantId: "mock-merchant",
        locationId: "mock-location"
      }),

      createPaymentLink: async () => {
        createCalls++
        throw makeError()
      },

      lookupClient: {
        checkout: {
          paymentLinks: {
            get: async () => {
              lookupCalls++
              throw new Error("Unexpected Square lookup")
            }
          }
        },
        orders: {
          get: async () => {
            lookupCalls++
            throw new Error("Unexpected Square order lookup")
          }
        }
      }
    }

    const result =
      await runV3TrustedSandboxExecutionForTests({
        orderId: id,
        owner,
        sdk
      })

    assert.equal(result.status, "reconciliation_required")
    assert.equal(result.safeToRetryCreation, false)
    assert.equal(result.paymentCreated, "unknown")
    assert.equal(result.diagnosticPersisted, expectPersisted)
    assert.equal(createCalls, 1)
    assert.equal(lookupCalls, 0)

    const saved = await PaymentOperation.findOne({
      orderId,
      idempotencyKey,
      requestOwner: owner
    }).lean()

    assert.ok(saved)
    assert.equal(saved.status, "reconciliation_required")
    assert.ok(saved.squareCreationAttemptClaimedAt)
    assert.equal(saved.squarePaymentLinkId, "")
    assert.equal(saved.squareOrderId, "")
    assert.equal(saved.paymentUrl, "")

    if (expectPersisted) {
      assert.ok(saved.squareDiagnostic)
      assert.equal(saved.squareDiagnostic.outcomeKnown, false)
      assert.equal(saved.squareDiagnostic.type, result.diagnostic.type)
    } else {
      assert.deepEqual(
        JSON.parse(JSON.stringify(saved.squareDiagnostic)),
        existingDiagnostic
      )
    }

    assert.ok(
      !JSON.stringify(saved.squareDiagnostic).includes("SECRET")
    )

    await assert.rejects(
      runV3TrustedSandboxExecutionForTests({
        orderId: id,
        owner,
        sdk
      })
    )

    assert.equal(createCalls, 1)

    console.log(`${name}: PASS`)
    console.log(`${name} - DURABLE CLAIM RETAINED: PASS`)
    console.log(`${name} - NO CREATION RETRY: PASS`)

  } finally {
    if (
      created &&
      mongoose.connection.readyState === 1 &&
      mongoose.connection.db?.databaseName === database
    ) {
      const removed = await PaymentOperation.deleteOne({
        orderId,
        idempotencyKey,
        requestOwner: owner
      })

      assert.equal(removed.deletedCount, 1)

      const locks = mongoose.connection.collection(
        "smart_shipping_v3_checkout_locks"
      )

      const lockCleanup = await locks.deleteOne({
        _id: orderId,
        owner
      })

      assert.equal(lockCleanup.deletedCount, 1)
    }
  }
}

try {
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")
  assert.ok(
    ["development", "test"].includes(process.env.NODE_ENV)
  )
  assert.notEqual(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "true",
    "STOP: External Square creation is enabled."
  )
  assert.ok(process.env.MONGO_URI)

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: database,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.db.databaseName, database)

  // Enable trusted execution ONLY inside this test process.
  // SDK injection prevents actual Square network calls.
  process.env.NODE_ENV = "test"
  process.env.SMART_SHIPPING_V3_ENABLED = "true"
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

  await runCase({
    name: "TRUSTED HTTP 400 DIAGNOSTIC",
    makeError: () => new SquareError({
      message: "SECRET_SQUARE_MESSAGE",
      statusCode: 400,
      body: { token: "SECRET_TOKEN" }
    }),
    expectPersisted: true
  })

  await runCase({
    name: "TRUSTED TIMEOUT DIAGNOSTIC",
    makeError: () =>
      new SquareTimeoutError("SECRET_TIMEOUT"),
    expectPersisted: true
  })

  const existingDiagnostic = {
    type: "unknown_exception",
    httpStatus: null,
    category: "",
    codeStatus: null,
    code: "",
    field: "",
    outcomeKnown: false
  }

  await runCase({
    name: "DIAGNOSTIC WRITE FAILURE FAILS CLOSED",
    makeError: () => new SquareTimeoutError("SECRET_TIMEOUT"),
    expectPersisted: false,
    existingDiagnostic
  })

  console.log("TRUSTED FAILURE-PATH INTEGRATION: PASS")
  console.log("NO REAL SQUARE API REQUESTS")
  console.log("NO PROTECTED EXISTING ORDERS TOUCHED")
} finally {
  restore()
  if (connected) await mongoose.disconnect()
}
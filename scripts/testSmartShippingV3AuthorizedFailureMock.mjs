import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFile, writeFile, unlink } from "node:fs/promises"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const dbName = "signavi_shipping_v3_dev"
const original = "scripts/executeSmartShippingV3OneShotSandbox.mjs"
const temporary = "scripts/.v3-failure-launcher-mock.mjs"
const mockFile = "scripts/.v3-failure-orchestration-mock.mjs"
const protectedId = "6add930c3b60c62003d103a6"

const id = new mongoose.Types.ObjectId()
const orderId = id.toHexString()
const reference = createV3SquareSafeCheckoutReference({ orderId })
const key = `v3-mock-${crypto.randomUUID()}`

let connected = false
let launcherCreated = false
let mockCreated = false
let fixtureInserted = false
let completed = false

assert.ok(["development", "test"].includes(process.env.NODE_ENV))
assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")
assert.notEqual(process.env.SMART_SHIPPING_V3_ENABLED, "true")
assert.notEqual(process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED, "true")
assert.ok(process.env.MONGO_URI)
assert.notEqual(orderId, protectedId)

const launcherSource = await readFile(original, "utf8")
const realImport = "../utils/smartShippingV3OneShotOrchestration.js"
const mockImport = "./.v3-failure-orchestration-mock.mjs"

assert.equal(launcherSource.split(protectedId).length - 1, 1)
assert.equal(launcherSource.split(realImport).length - 1, 1)
assert.ok(launcherSource.includes("reservationStarted = true"))
assert.ok(launcherSource.includes("expectedCheckoutReferenceId: reference"))
assert.ok(launcherSource.includes("expectedIdempotencyKey: operation.idempotencyKey"))

const isolatedSource = launcherSource
  .replace(protectedId, orderId)
  .replace(realImport, mockImport)

assert.ok(!isolatedSource.includes(protectedId))
assert.ok(!isolatedSource.includes(realImport))
assert.ok(isolatedSource.includes(mockImport))

const mockSource = `
export const runV3OneShotTrustedExecution = async ({
  orderId,
  expectedCheckoutReferenceId,
  expectedIdempotencyKey
}) => {
  if (
    orderId !== process.env.V3_MOCK_ORDER ||
    expectedCheckoutReferenceId !== process.env.V3_MOCK_REFERENCE ||
    expectedIdempotencyKey !== process.env.V3_MOCK_KEY
  ) {
    throw new Error("mock_payment_identity_mismatch")
  }

  console.log("ISOLATED_MOCK_ORCHESTRATION_CALLED")
  throw new Error("simulated_orchestration_failure")
}
`

try {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })
  connected = true
  assert.equal(mongoose.connection.db.databaseName, dbName)

  const locks = mongoose.connection.db.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const [priorOrder, priorOps, priorLock] = await Promise.all([
    Order.collection.findOne({ _id: id }),
    PaymentOperation.collection.find({ orderId: id }).toArray(),
    locks.findOne({ _id: id })
  ])

  assert.equal(priorOrder, null)
  assert.equal(priorOps.length, 0)
  assert.equal(priorLock, null)

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "pending",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: ""
  })
  fixtureInserted = true

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 100,
    environment: "sandbox",
    status: "pending",
    checkoutReferenceId: reference,
    idempotencyKey: key,
    requestOwner: "",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  await writeFile(mockFile, mockSource, { flag: "wx" })
  mockCreated = true

  await writeFile(temporary, isolatedSource, { flag: "wx" })
  launcherCreated = true

  const syntax = spawnSync(process.execPath, ["--check", temporary], {
    encoding: "utf8",
    timeout: 10000
  })

  assert.equal(syntax.error, undefined)
  assert.equal(syntax.status, 0)

  const result = spawnSync(
    process.execPath,
    [temporary, "--execute", orderId],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        SQUARE_ENVIRONMENT: "sandbox",
        SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: orderId,
        SMART_SHIPPING_V3_ENABLED: "true",
        SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "true",
        V3_MOCK_ORDER: orderId,
        V3_MOCK_REFERENCE: reference,
        V3_MOCK_KEY: key,
        SQUARE_SANDBOX_ACCESS_TOKEN: "",
        SQUARE_SANDBOX_MERCHANT_ID: "",
        SQUARE_SANDBOX_LOCATION_ID: "",
        SQUARE_ACCESS_TOKEN: "",
        NODE_OPTIONS: ""
      },
      encoding: "utf8",
      timeout: 15000
    }
  )

  assert.equal(result.error, undefined, "Child process error")

  const output = `${result.stdout}\n${result.stderr}`

  assert.notEqual(
    result.status,
    0,
    "Failure mock unexpectedly succeeded."
  )

  assert.ok(output.includes("ISOLATED_MOCK_ORCHESTRATION_CALLED"))
  assert.ok(output.includes("ONE-SHOT SANDBOX STOPPED: execution_stopped"))
  assert.ok(output.includes("INSPECT PERSISTED STATE BEFORE ANY FURTHER ACTION"))
  assert.ok(output.includes("DO NOT RETRY OR RESET PAYMENT CLAIM"))
  assert.ok(!output.includes("SANDBOX PAYMENT LINK VERIFIED"))
  assert.ok(!output.includes("EXECUTION RESULT: completed"))

  const [order, operation, lock] = await Promise.all([
    Order.collection.findOne({ _id: id }),
    PaymentOperation.collection.findOne({
      orderId: id,
      idempotencyKey: key
    }),
    locks.findOne({ _id: id })
  ])

  assert.equal(order.paymentStatus, "pending")
  assert.ok(!order.squarePaymentLinkId)

  // Mock execution deliberately makes no persistent payment changes.
  assert.equal(operation.status, "pending")
  assert.equal(operation.checkoutReferenceId, reference)
  assert.equal(operation.idempotencyKey, key)
  assert.ok(operation.squareCreationAttemptClaimedAt == null)
  assert.ok(!operation.requestOwner)
  assert.ok(!operation.squarePaymentLinkId)
  assert.equal(lock, null)

  completed = true

  console.log("AUTHORIZED FAILURE LAUNCHER PATH: PASS")
  console.log("PAYMENT IDENTITY ARGUMENTS VERIFIED: PASS")
  console.log("MOCK FAILURE INVOKED: PASS")
  console.log("FAIL-CLOSED WARNING VERIFIED: PASS")
  console.log("ORDER REMAINS UNPAID: PASS")
  console.log("CREATION CLAIM UNUSED: PASS")
  console.log("NO CHECKOUT LOCK CREATED: PASS")
  console.log("NO REAL SQUARE REQUESTS: PASS")
} finally {
  if (launcherCreated) await unlink(temporary)
  if (mockCreated) await unlink(mockFile)

  try {
    if (connected && fixtureInserted && completed) {
      await PaymentOperation.collection.deleteOne({
        orderId: id,
        idempotencyKey: key,
        status: "pending",
        squareCreationAttemptClaimedAt: null
      })

      await Order.collection.deleteOne({
        _id: id,
        paymentStatus: "pending"
      })

      console.log("ISOLATED FIXTURES CLEANED: PASS")
    } else if (fixtureInserted && !completed) {
      console.error("TEST INCOMPLETE: INSPECT TEMPORARY FIXTURE")
      console.error("TEMPORARY ORDER ID:", orderId)
      console.error("DO NOT RESET ANY CLAIM OR LOCK")
    }
  } finally {
    if (connected) await mongoose.disconnect()
  }
}
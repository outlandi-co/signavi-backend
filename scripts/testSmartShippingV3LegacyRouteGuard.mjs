import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  checkV3LegacyPaymentConflict
} from "../utils/smartShippingV3LegacyRouteGuard.js"

const orderId = "6adb60ab0856ccfc26aa57cf"

const originalReadyState =
  Object.getOwnPropertyDescriptor(
    mongoose.connection,
    "readyState"
  )

const originalExists = PaymentOperation.exists
const originalCollection = mongoose.connection.collection

let operation = null
let lock = null
let failLookup = false

try {
  Object.defineProperty(mongoose.connection, "readyState", {
    configurable: true,
    value: 1
  })

  PaymentOperation.exists = async () => {
    if (failLookup) {
      throw new Error("Mock operation lookup failed.")
    }
    return operation
  }

  mongoose.connection.collection = () => ({
    findOne: async () => {
      if (failLookup) {
        throw new Error("Mock lock lookup failed.")
      }
      return lock
    }
  })

  const clean = await checkV3LegacyPaymentConflict({
    orderId
  })

  assert.equal(clean.blocked, false)
  assert.equal(clean.squareRequestAuthorized, false)
  console.log("NO V3 CONFLICT: PASS")

  operation = { _id: "mock-operation" }

  const existingOperation =
    await checkV3LegacyPaymentConflict({ orderId })

  assert.equal(existingOperation.blocked, true)
  console.log("EXISTING V3 OPERATION: BLOCKED")

  operation = null
  lock = { _id: orderId }

  const existingLock =
    await checkV3LegacyPaymentConflict({ orderId })

  assert.equal(existingLock.blocked, true)
  console.log("EXISTING V3 LOCK: BLOCKED")

  failLookup = true

  await assert.rejects(
    checkV3LegacyPaymentConflict({ orderId }),
    /lookup failed/
  )
  console.log("DATABASE FAILURE: REJECTED")

  await assert.rejects(
    checkV3LegacyPaymentConflict({ orderId: "invalid" }),
    /Invalid order ID/
  )
  console.log("INVALID ORDER ID: REJECTED")

  console.log("ALL LEGACY GUARD TESTS PASSED")
  console.log("NO REAL DATABASE OR SQUARE REQUESTS")
} finally {
  PaymentOperation.exists = originalExists
  mongoose.connection.collection = originalCollection

  if (originalReadyState) {
    Object.defineProperty(
      mongoose.connection,
      "readyState",
      originalReadyState
    )
  } else {
    delete mongoose.connection.readyState
  }
}
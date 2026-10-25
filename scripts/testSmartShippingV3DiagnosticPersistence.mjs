import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  persistV3SquareDiagnostic
} from "../utils/smartShippingV3PersistSquareDiagnostic.js"

const databaseName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const owner = `diagnostic-test-${crypto.randomUUID()}`
const idempotencyKey = `diagnostic-test-${crypto.randomUUID()}`

const diagnostic = {
  type: "square_api_error",
  statusCode: 400,
  category: "INVALID_REQUEST_ERROR",
  code: "INVALID_VALUE",
  field: "order.location_id",
  outcomeKnown: false,
  message: "SECRET_SQUARE_MESSAGE",
  token: "SECRET_TOKEN"
}

let created = false

try {
  assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")
  assert.ok(
    ["development", "test"].includes(process.env.NODE_ENV),
    "NODE_ENV must be development or test"
  )

  assert.equal(
    process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED,
    "false",
    "Square creation must remain explicitly disabled"
  )

  assert.ok(process.env.MONGO_URI)

  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    databaseName
  )

  await PaymentOperation.create({
    orderId,
    idempotencyKey,
    amountCents: 100,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: owner,
    squareCreationAttemptClaimedAt: new Date(),
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: "",
    lastError: "Square request outcome not yet confirmed."
  })

  created = true

  await assert.rejects(
    persistV3SquareDiagnostic({
      orderId: String(orderId),
      owner: "wrong-owner",
      diagnostic
    })
  )

  console.log("FOREIGN OWNER REJECTED: PASS")

  const result = await persistV3SquareDiagnostic({
    orderId: String(orderId),
    owner,
    diagnostic
  })

  assert.equal(result.saved, true)
  assert.equal(result.diagnostic.httpStatus, 400)

  const saved = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(saved.status, "reconciliation_required")
  assert.equal(saved.requestOwner, owner)
  assert.ok(saved.squareCreationAttemptClaimedAt)
  assert.equal(saved.squarePaymentLinkId, "")
  assert.equal(saved.squareOrderId, "")

  assert.equal(saved.squareDiagnostic.type, "square_api_error")
  assert.equal(saved.squareDiagnostic.httpStatus, 400)
  assert.equal(
    saved.squareDiagnostic.category,
    "INVALID_REQUEST_ERROR"
  )
  assert.equal(saved.squareDiagnostic.code, "INVALID_VALUE")
  assert.equal(saved.squareDiagnostic.field, "order.location_id")
  assert.equal(saved.squareDiagnostic.outcomeKnown, false)

  assert.ok(
    !JSON.stringify(saved.squareDiagnostic).includes("SECRET")
  )

  console.log("SANITIZED DIAGNOSTIC PERSISTED: PASS")
  console.log("CREATION CLAIM PRESERVED: PASS")
  console.log("RECONCILIATION STATUS PRESERVED: PASS")
  console.log("SENSITIVE VALUES EXCLUDED: PASS")

  await assert.rejects(
    persistV3SquareDiagnostic({
      orderId: String(orderId),
      owner,
      diagnostic
    })
  )

  console.log("DUPLICATE DIAGNOSTIC WRITE REJECTED: PASS")

} finally {
  if (
    created &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.db?.databaseName === databaseName
  ) {
    await PaymentOperation.deleteOne({
      orderId,
      idempotencyKey,
      requestOwner: owner
    })
  }

  await mongoose.disconnect()
}

console.log("ISOLATED FIXTURE CLEANUP: PASS")
console.log("NO SQUARE API REQUESTS")
console.log("DIAGNOSTIC PERSISTENCE TESTS PASSED")
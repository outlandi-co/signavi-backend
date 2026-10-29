import { createHash } from "node:crypto"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  recordV3ProductionCheckoutLink
} from "../utils/recordV3ProductionCheckoutLink.js"

let mongo

const orderId = new mongoose.Types.ObjectId()
const id = String(orderId)
const key = `signavi-v3-production-purchase-${id}`
const owner = "trusted-checkout-001"

try {
  // Do not use any configured application database URI.
  mongo = await MongoMemoryServer.create()

  await mongoose.connect(mongo.getUri(), {
    dbName: "signavi_v3_checkout_link_isolated_test",
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_v3_checkout_link_isolated_test"
  )

  console.log("PASS: isolated MongoDB connected")

  // Verify the actual Mongoose operation schema before
  // trying to record a Square link.
  const requiredPaths = [
    "orderId",
    "environment",
    "idempotencyKey",
    "amountCents",
    "status",
    "squareCreationAttemptClaimedAt",
    "squarePaymentLinkId",
    "squareOrderId",
    "paymentUrl"
  ]

  for (const field of requiredPaths) {
    assert.ok(
      PaymentOperation.schema.path(field),
      `PAYMENT_OPERATION_SCHEMA_MISSING_${field}`
    )
  }

  console.log("PASS: payment operation fields exist")

  await Reservation.init()
  await PaymentOperation.init()

  const indexes = await Reservation.collection.indexes()

  for (const indexName of [
    "unique_production_v3_purchase",
    "unique_production_v3_order",
    "unique_production_v3_idempotency"
  ]) {
    assert.ok(
      indexes.some(index =>
        index.name === indexName && index.unique === true
      ),
      `Missing unique index: ${indexName}`
    )
  }

  console.log("PASS: reservation unique indexes")

  await Reservation.create({
    environment: "production",
    orderId,
    purchaseKey: key,
    claimedByDocumentType: "order",
    claimedByDocumentId: orderId,
    status: "claim_pending",
    idempotencyKey: key,
    attemptClaimedAt: new Date(),
    checkoutClaimOwner: owner,
    checkoutClaimAmountCents: 2500
  })

const squareKeyFor = purchaseKey =>
  `sv3p-${createHash("sha256")
    .update(`square-link:production:${purchaseKey}`)
    .digest("hex")
    .slice(0, 40)}`
  const operationData = {
    orderId,
    environment: "production",
    idempotencyKey: key,
    squareIdempotencyKey: squareKeyFor(key),
    requestOwner: owner,
    amountCents: 2500,
    status: "reconciliation_required",
    squareCreationAttemptClaimedAt: new Date(),
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }

  // Report incompatible required fields rather than
  // inventing production values.
  const operationDocument = new PaymentOperation(operationData)
  await operationDocument.validate()

  await operationDocument.save()

  const args = {
    Reservation,
    PaymentOperation,
    orderId: id,
    owner,
    amountCents: 2500,
    paymentLinkId: "isolated-link-001",
    squareOrderId: "isolated-square-order-001",
    paymentUrl: "https://square.example/checkout"
  }

  const first = await recordV3ProductionCheckoutLink(args)

  assert.equal(
    first.recorded,
    true,
    `First recording blocked: ${first.reason}`
  )

  console.log("PASS: first checkout link recorded")

  const duplicate = await recordV3ProductionCheckoutLink(args)

  assert.equal(duplicate.recorded, false)

  console.log("PASS: duplicate recording blocked")

  const stored = await PaymentOperation.findOne({
    orderId,
    environment: "production",
    idempotencyKey: key
  }).lean()

  assert.ok(stored)
  assert.equal(stored.squarePaymentLinkId, args.paymentLinkId)
  assert.equal(stored.squareOrderId, args.squareOrderId)
  assert.equal(stored.paymentUrl, args.paymentUrl)
  assert.equal(stored.status, "reconciliation_required")
  assert.ok(stored.squareCreationAttemptClaimedAt)

  console.log("PASS: payment link persisted")
  console.log("PASS: operation remains reconciliation_required")

  const wrongOwner = await recordV3ProductionCheckoutLink({
    ...args,
    owner: "different-owner-001"
  })

  assert.equal(wrongOwner.recorded, false)

  console.log("PASS: mismatched owner blocked")

  const totalOperations = await PaymentOperation.countDocuments({
    orderId,
    environment: "production"
  })

  assert.equal(totalOperations, 1)

  console.log("PASS: no duplicate payment operations")
  // A second, independent purchase tests simultaneous writes.
  const concurrentOrderId = new mongoose.Types.ObjectId()
  const concurrentId = String(concurrentOrderId)
  const concurrentKey =
    `signavi-v3-production-purchase-${concurrentId}`

  await Reservation.create({
    environment: "production",
    orderId: concurrentOrderId,
    purchaseKey: concurrentKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: concurrentOrderId,
    status: "claim_pending",
    idempotencyKey: concurrentKey,
    attemptClaimedAt: new Date(),
    checkoutClaimOwner: owner,
    checkoutClaimAmountCents: 2500
  })

  await PaymentOperation.create({
    orderId: concurrentOrderId,
    environment: "production",
    idempotencyKey: concurrentKey,
    squareIdempotencyKey: squareKeyFor(concurrentKey),
    requestOwner: owner,
    amountCents: 2500,
    status: "reconciliation_required",
    squareCreationAttemptClaimedAt: new Date(),
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  const competing = await Promise.all(
    Array.from({ length: 25 }, (_, index) =>
      recordV3ProductionCheckoutLink({
        Reservation,
        PaymentOperation,
        orderId: concurrentId,
        owner,
        amountCents: 2500,
        paymentLinkId: `isolated-link-${index}`,
        squareOrderId: `isolated-order-${index}`,
        paymentUrl:
          `https://square.example/checkout/${index}`
      })
    )
  )

  const successful = competing.filter(x => x.recorded === true)
  const rejected = competing.filter(x => x.recorded === false)

  assert.equal(successful.length, 1)
  assert.equal(rejected.length, 24)

  const concurrentStored = await PaymentOperation.findOne({
    orderId: concurrentOrderId,
    environment: "production",
    idempotencyKey: concurrentKey
  }).lean()

  assert.ok(concurrentStored)
  assert.equal(concurrentStored.status, "reconciliation_required")
  assert.ok(concurrentStored.squarePaymentLinkId)
  assert.ok(concurrentStored.squareOrderId)
  assert.ok(concurrentStored.paymentUrl)

  const matchingIndex = Number(
    concurrentStored.squarePaymentLinkId.replace(
      "isolated-link-", ""
    )
  )

  assert.ok(
    Number.isInteger(matchingIndex) &&
    matchingIndex >= 0 &&
    matchingIndex < 25
  )
  assert.equal(
    concurrentStored.squareOrderId,
    `isolated-order-${matchingIndex}`
  )
  assert.equal(
    concurrentStored.paymentUrl,
    `https://square.example/checkout/${matchingIndex}`
  )

  console.log("PASS: 25 concurrent MongoDB link recordings")
  console.log("PASS: 1 successful recording, 24 blocked")
  console.log("PASS: winning link identity persisted consistently")
  console.log("PASS: purchase remains locked for reconciliation")
  console.log("STEP 270: CONCURRENT LINK RECORDING PASSED")
  console.log("STEP 269: REAL MONGODB RECORDING TESTS PASSED")
  console.log("ISOLATED DATABASE ONLY")
  console.log("NO SQUARE REQUESTS")
} finally {
  await mongoose.disconnect().catch(() => {})
  if (mongo) await mongo.stop()
}
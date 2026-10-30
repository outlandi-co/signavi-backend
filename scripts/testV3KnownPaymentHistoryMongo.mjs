import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Order from "../models/Order.js"
import SquareReservation from "../models/SquarePaymentCreationReservation.js"
import SharedPaymentReservation from "../models/SharedSquarePaymentReservation.js"
import ProductionReservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  checkV3KnownPaymentHistory
} from "../utils/checkV3KnownPaymentHistory.js"

import {
  prepareV3TrustedHttpCheckout
} from "../utils/prepareV3TrustedHttpCheckout.js"

let replica

const newId = () => new mongoose.Types.ObjectId()

const check = orderId => checkV3KnownPaymentHistory({
  orderId: String(orderId),
  Order,
  SquareReservation,
  SharedPaymentReservation,
  ProductionReservation,
  PaymentOperation
})

async function insertOrder(id) {
  await Order.collection.insertOne({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    finalPrice: 27.50,
    paymentUrl: "",
    squarePaymentId: "",
    squareOrderId: "",
    squarePaymentLinkId: "",
    paymentUrlCreatedAt: null
  })
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_history_integration_isolated",
    serverSelectionTimeoutMS: 10000
  })

  for (const model of [
    Order,
    SquareReservation,
    SharedPaymentReservation,
    ProductionReservation,
    PaymentOperation
  ]) {
    await model.init()
  }

  console.log("PASS: Isolated MongoDB indexes initialized")

  // No matching Mongo records must NEVER certify Square clearance.
  const cleanId = newId()
  await insertOrder(cleanId)

  const clear = await check(cleanId)

  assert.equal(clear.knownRecordsClear, true)
  assert.equal(clear.verified, false)
  assert.equal(clear.noPriorPaymentActivity, false)

  console.log("PASS: Empty Mongo history does not authorize Square")

  let initializationCalls = 0

  const preflight = await prepareV3TrustedHttpCheckout({
    order: await Order.findById(cleanId),
    authorizeRequest: async () => true,
    checkHistoricalPayment: ({ orderId }) => check(orderId),
    initializeCheckout: async () => {
      initializationCalls++
      throw new Error("INITIALIZER_MUST_NOT_RUN")
    }
  })

  assert.equal(preflight.ready, false)
  assert.equal(preflight.httpStatus, 423)
  assert.equal(initializationCalls, 0)

  console.log("PASS: HTTP preflight refuses initialization without Square clearance")

  const sources = [
    {
      name: "legacy Square creation reservation",
      model: SquareReservation,
      build: id => ({
        orderId: id,
        environment: "production",
        idempotencyKey: `history-test-square-${id}`,
        amountCents: 2750,
        status: "reconciliation_required"
      }),
      source: "SquarePaymentCreationReservation"
    },
    {
      name: "shared payment reservation",
      model: SharedPaymentReservation,
      build: id => ({
        documentType: "order",
        documentId: id,
        environment: "production",
        idempotencyKey: `history-test-shared-${id}`,
        amountCents: 2750,
        status: "reconciliation_required"
      }),
      source: "SharedSquarePaymentReservation"
    },
    {
      name: "V3 production reservation",
      model: ProductionReservation,
      build: id => ({
        environment: "production",
        orderId: id,
        purchaseKey: `history-test-purchase-${id}`,
        idempotencyKey: `history-test-purchase-${id}`,
        claimedByDocumentType: "order",
        claimedByDocumentId: id,
        status: "reserved"
      }),
      source: "SmartShippingV3ProductionPurchaseReservation"
    },
    {
      name: "V3 payment operation",
      model: PaymentOperation,
      build: id => ({
        orderId: id,
        environment: "production",
        idempotencyKey: `history-test-operation-${id}`,
        amountCents: 2750,
        status: "pending"
      }),
      source: "SmartShippingV3PaymentOperation"
    }
  ]

  for (const scenario of sources) {
    const id = newId()
    await insertOrder(id)

    await scenario.model.collection.insertOne(
      scenario.build(id)
    )

    const result = await check(id)

    assert.equal(result.verified, false, scenario.name)
    assert.equal(result.knownRecordsClear, false, scenario.name)
    assert.equal(result.source, scenario.source, scenario.name)

    console.log(`PASS: Existing ${scenario.name} blocks clearance`)
  }

  const existingOrderId = newId()
  await insertOrder(existingOrderId)

  await Order.collection.updateOne(
    { _id: existingOrderId },
    {
      $set: {
        squarePaymentLinkId: "EXISTING_SQUARE_LINK_373"
      }
    }
  )

  const existingOrderResult = await check(existingOrderId)

  assert.equal(existingOrderResult.verified, false)
  assert.equal(existingOrderResult.source, "Order")

  console.log("PASS: Existing Order Square link blocks clearance")

  const invalid = await check("not-an-order")
  assert.equal(invalid.verified, false)

  const nonexistent = await check(newId())
  assert.equal(nonexistent.verified, false)
  assert.equal(nonexistent.reason, "ORDER_NOT_FOUND")

  console.log("PASS: Invalid and missing orders fail closed")

  console.log("===== STEP 373 MONGODB HISTORY TESTS PASSED =====")
  console.log("ISOLATED MONGODB ONLY")
  console.log("ZERO SQUARE REQUESTS")
  console.log("ZERO CHECKOUT INITIALIZATIONS")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}
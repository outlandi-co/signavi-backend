import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.MONGO_URI

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" }
})

try {
  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test")
  )

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_reservation_isolated_test"
  )

  const { default: PurchaseReservation } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )
  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )
  const { claimV3SharedPurchaseIsolated: claim } = await import(
    "../utils/claimV3SharedPurchaseIsolated.js"
  )

  // Explicitly build uniqueness indexes before racing.
  await PurchaseReservation.init()
  await Association.init()

  const makePair = async () => {
    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    await Association.create({
      orderId,
      invoiceId,
      environment: "sandbox",
      purchaseKey: `order:${orderId}`,
      amountCents: 5528
    })

    return { orderId, invoiceId }
  }

  const compete = async (firstType, attempts = 50) => {
    const pair = await makePair()

    const orderClaim = () => claim({
      orderId: pair.orderId,
      documentType: "order",
      documentId: pair.orderId
    })

    const invoiceClaim = () => claim({
      orderId: pair.orderId,
      documentType: "invoice",
      documentId: pair.invoiceId
    })

    const tasks = Array.from(
      { length: attempts },
      (_, index) => {
        const useFirst = index % 2 === 0
        const type = useFirst
          ? firstType
          : firstType === "order" ? "invoice" : "order"

        return type === "order"
          ? orderClaim()
          : invoiceClaim()
      }
    )

    const results = await Promise.all(tasks)

    assert.equal(
      results.filter(result => result.claimed).length,
      1
    )

    assert.equal(
      results.filter(result =>
        result.reason === "purchase_already_claimed"
      ).length,
      attempts - 1
    )

    const records = await PurchaseReservation.find({
      environment: "sandbox",
      purchaseKey: `order:${pair.orderId}`
    }).lean()

    assert.equal(records.length, 1)
    assert.equal(records[0].status, "reconciliation_required")

    const winner = results.find(result => result.claimed)

    assert.equal(winner.squareRequestAuthorized, false)
    assert.equal(winner.paymentCreated, false)

    return { pair, records, winner }
  }

  const first = await compete("order")
  console.log("ORDER/INVOICE COMPETITION: ONE WINNER")

  const second = await compete("invoice")
  console.log("INVOICE/ORDER COMPETITION: ONE WINNER")

  const missing = new mongoose.Types.ObjectId()
  const other = new mongoose.Types.ObjectId()

  await assert.rejects(
    claim({
      orderId: missing,
      documentType: "invoice",
      documentId: other
    }),
    /association missing/
  )

  console.log("UNLINKED INVOICE CLAIM: BLOCKED")

  await assert.rejects(
    claim({
      orderId: missing,
      documentType: "order",
      documentId: other
    }),
    /identity mismatch/
  )

  console.log("MISMATCHED ORDER IDENTITY: BLOCKED")

  // The winning claim must survive a repeated attempt.
  const repeated = await claim({
    orderId: first.pair.orderId,
    documentType: "order",
    documentId: first.pair.orderId
  })

  assert.equal(repeated.claimed, false)
  assert.equal(repeated.reason, "purchase_already_claimed")

  assert.equal(
    await PurchaseReservation.countDocuments({
      purchaseKey: `order:${first.pair.orderId}`,
      environment: "sandbox"
    }),
    1
  )

  console.log("REPEATED CLAIM: BLOCKED")
  console.log("50 ATTEMPTS PER COMPETITION")
  console.log("SQUARE REQUESTS: NONE")
  console.log("SHARED PURCHASE COMPETITION TEST PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const replica = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" }
})

try {
  await mongoose.connect(
    replica.getUri("signavi_reservation_isolated_test")
  )

  const {
    acquireV3CheckoutLock,
    releaseV3CheckoutLock
  } = await import("../utils/smartShippingV3CheckoutLock.js")

  const { runV3OwnedPaymentTransition } = await import(
    "../utils/smartShippingV3AtomicTransition.js"
  )

  const { default: Association } = await import(
    "../models/InvoiceOrderAssociationV3.js"
  )

  await Association.init()

  const orderId = new mongoose.Types.ObjectId()
  const invoiceId = new mongoose.Types.ObjectId()

  const attempts = await Promise.all(
    Array.from({ length: 25 }, () =>
      acquireV3CheckoutLock(String(orderId))
    )
  )

  const winners = attempts.filter(Boolean)

  assert.equal(winners.length, 1)
  assert.equal(attempts.filter(x => !x).length, 24)

  console.log("CHECKOUT LOCK: 1 OWNER, 24 BLOCKED")

  const lock = winners[0]

  const saved = await runV3OwnedPaymentTransition({
    orderId: String(orderId),
    owner: lock.owner,
    transition: async session => {
      const records = await Association.create([{
        invoiceId,
        orderId,
        environment: "sandbox",
        purchaseKey: `order:${orderId}`,
        amountCents: 15000
      }], { session })

      return {
        associationId: String(records[0]._id),
        squareRequestAuthorized: false
      }
    }
  })

  assert.ok(saved.associationId)
  assert.equal(saved.squareRequestAuthorized, false)

  assert.equal(
    await Association.countDocuments({ orderId }),
    1
  )

  console.log("OWNED TRANSACTION: ASSOCIATION SAVED")

  await assert.rejects(
    runV3OwnedPaymentTransition({
      orderId: String(orderId),
      owner: "invalid-owner",
      transition: async () => ({ accepted: true })
    }),
    /ownership required/
  )

  console.log("INVALID LOCK OWNER: BLOCKED")

  const released = await releaseV3CheckoutLock(lock)

  assert.equal(released, true)

  const replacement = await acquireV3CheckoutLock(
    String(orderId)
  )

  assert.ok(replacement)

  await assert.rejects(
    runV3OwnedPaymentTransition({
      orderId: String(orderId),
      owner: replacement.owner,
      transition: async session => {
        await Association.create([{
          invoiceId: new mongoose.Types.ObjectId(),
          orderId,
          environment: "sandbox",
          purchaseKey: `order:${orderId}`,
          amountCents: 15000
        }], { session })

        return { accepted: true }
      }
    }),
    error => error?.code === 11000
  )

  assert.equal(
    await Association.countDocuments({ orderId }),
    1
  )

  console.log("DUPLICATE ORDER ASSOCIATION: BLOCKED")

  const expired = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .updateOne(
      { _id: orderId, owner: replacement.owner },
      { $set: { expiresAt: new Date(0) } }
    )

  assert.equal(expired.matchedCount, 1)

  await assert.rejects(
    runV3OwnedPaymentTransition({
      orderId: String(orderId),
      owner: replacement.owner,
      transition: async () => ({ accepted: true })
    }),
    /ownership required/
  )

  console.log("EXPIRED LOCK OWNER: BLOCKED")
  console.log("ASSOCIATIONS REMAIN: 1")
  console.log("SQUARE REQUESTS: NONE")
  console.log("CHECKOUT ASSOCIATION LOCK TEST PASSED")
} finally {
  await mongoose.disconnect()
  await replica.stop()
}
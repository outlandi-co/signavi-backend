import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  persistV3AtomicOrderPayment
} from "../utils/smartShippingV3AtomicOrderPayment.js"
import {
  createGuestCheckoutToken
} from "../utils/guestCheckoutToken.js"
import {
  createV3OrderFingerprint
} from "../utils/smartShippingV3OrderFingerprint.js"
import {
  createV3SignedQuote
} from "../utils/smartShippingV3QuoteSigning.js"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const dbName = "signavi_shipping_v3_dev"
const ids = [
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId(),
  new mongoose.Types.ObjectId()
]

process.env.NODE_ENV = "development"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

let connected = false

const createFixture = async id => {
  await new Order({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: `V3 ATOMIC ${crypto.randomUUID()}`,
    email: "v3-atomic@example.com",
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "90001",
      country: "US"
    },
    subtotal: 39.98,
    tax: 3.30,
    items: [{
      productId: new mongoose.Types.ObjectId(),
      quantity: 2,
      finalPrice: 19.99,
      variant: { color: "black", size: "L" }
    }]
  }).save()

  const order = await Order.findById(id)

  const guestToken = createGuestCheckoutToken(order)

  const signedQuote = createV3SignedQuote({
    cartFingerprint: createV3OrderFingerprint(order),
    shippingAmountCents: 1200,
    parcelRateIds: ["test_rate_1", "test_rate_2"],
    carrier: "USPS",
    serviceToken: "usps_ground_advantage"
  })

  const coordination = await coordinateV3PaymentPreparation({
    orderId: id,
    amountCents: 5528
  })

  assert.equal(coordination.success, true)

  return {
    id,
    guestToken,
    signedQuote,
    lock: coordination.lock
  }
}

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED V3 DATABASE: PASS")

  const good = await createFixture(ids[0])

  const result = await persistV3AtomicOrderPayment({
    lock: good.lock,
    guestToken: good.guestToken,
    signedQuote: good.signedQuote
  })

  assert.equal(result.orderPaymentBound, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(
    result.checkoutReferenceId,
    createV3SquareSafeCheckoutReference({ orderId: good.id })
  )

  const savedOrder = await Order.findById(good.id).lean()
  const savedOperation = await PaymentOperation.findOne({
    orderId: good.id
  }).lean()

  assert.ok(savedOrder)
  assert.ok(savedOperation)
  assert.equal(savedOrder.squareEnvironment, "sandbox")
  assert.equal(savedOrder.squareExpectedAmountCents, 5528)
  assert.equal(Math.round(savedOrder.finalPrice * 100), 5528)
  assert.equal(Math.round(savedOrder.shipping * 100), 1200)
  assert.equal(savedOperation.amountCents, 5528)
  assert.equal(savedOperation.status, "pending")
  assert.equal(
    savedOperation.checkoutReferenceId,
    result.checkoutReferenceId
  )

  console.log("ATOMIC ORDER/PAYMENT COMMIT: PASS")
  console.log("CANONICAL REFERENCE PRESERVED: PASS")
  console.log("NO PAYMENT REQUEST AUTHORIZED: PASS")

  const blocked = await createFixture(ids[1])

  const originalOrder = await Order.findById(
    blocked.id
  ).lean()

  const originalOperation = await PaymentOperation.findOne({
    orderId: blocked.id
  }).lean()

  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  const originalLock = await locks.findOne({
    _id: blocked.id
  })

  const assertUnchanged = async label => {
    assert.deepEqual(
      await Order.findById(blocked.id).lean(),
      originalOrder
    )
    assert.deepEqual(
      await PaymentOperation.findOne({
        orderId: blocked.id
      }).lean(),
      originalOperation
    )
    assert.deepEqual(
      await locks.findOne({ _id: blocked.id }),
      originalLock
    )

    console.log(`${label}: PASS (database unchanged)`)
  }

  await assert.rejects(
    persistV3AtomicOrderPayment({
      lock: {
        ...blocked.lock,
        owner: "incorrect-owner"
      },
      guestToken: blocked.guestToken,
      signedQuote: blocked.signedQuote
    }),
    /lock ownership required/
  )

  await assertUnchanged("INCORRECT LOCK OWNER")

  await assert.rejects(
    persistV3AtomicOrderPayment({
      lock: blocked.lock,
      guestToken: blocked.guestToken,
      signedQuote: blocked.signedQuote + "tampered"
    }),
    /authorization or quote invalid/
  )

  await assertUnchanged("INVALID QUOTE ROLLBACK")

  // Change the blocked order after its quote was signed.
  // A stale quote must not authorize persistence.
  await Order.updateOne(
    { _id: blocked.id },
    { $set: { subtotal: 49.98 } }
  )

  const staleOrder = await Order.findById(blocked.id).lean()
  const staleOperation = await PaymentOperation.findOne({
    orderId: blocked.id
  }).lean()
  const staleLock = await locks.findOne({ _id: blocked.id })

  await assert.rejects(
    persistV3AtomicOrderPayment({
      lock: blocked.lock,
      guestToken: blocked.guestToken,
      signedQuote: blocked.signedQuote
    }),
    /authorization or quote invalid|binding mismatch/
  )

  assert.deepEqual(
    await Order.findById(blocked.id).lean(),
    staleOrder
  )

  assert.deepEqual(
    await PaymentOperation.findOne({
      orderId: blocked.id
    }).lean(),
    staleOperation
  )

  assert.deepEqual(
    await locks.findOne({ _id: blocked.id }),
    staleLock
  )

  console.log("STALE SIGNED QUOTE REJECTED: PASS")
  console.log("STALE ORDER TRANSACTION ROLLBACK: PASS")

  // Both requests use the same legitimate lock owner.
  // The database must remain consistent even if one
  // transaction encounters a concurrent write conflict.
  const concurrent = await createFixture(ids[2])

  const attempts = await Promise.allSettled([
    persistV3AtomicOrderPayment({
      lock: concurrent.lock,
      guestToken: concurrent.guestToken,
      signedQuote: concurrent.signedQuote
    }),
    persistV3AtomicOrderPayment({
      lock: concurrent.lock,
      guestToken: concurrent.guestToken,
      signedQuote: concurrent.signedQuote
    })
  ])

  const successful = attempts.filter(
    item => item.status === "fulfilled"
  )

  assert.ok(
    successful.length >= 1,
    "No concurrent persistence request succeeded."
  )

  for (const item of successful) {
    assert.equal(item.value.orderPaymentBound, true)
    assert.equal(item.value.amountCents, 5528)
    assert.equal(item.value.squareRequestAuthorized, false)
  }

  const concurrentOrder = await Order.findById(
    concurrent.id
  ).lean()

  const concurrentOperation = await PaymentOperation.findOne({
    orderId: concurrent.id
  }).lean()

  const concurrentLock = await locks.findOne({
    _id: concurrent.id
  })

  assert.ok(concurrentOrder)
  assert.ok(concurrentOperation)
  assert.ok(concurrentLock)

  assert.equal(concurrentOrder.squareEnvironment, "sandbox")
  assert.equal(concurrentOrder.squareExpectedAmountCents, 5528)
  assert.equal(Math.round(concurrentOrder.finalPrice * 100), 5528)
  assert.equal(Math.round(concurrentOrder.shipping * 100), 1200)

  assert.equal(concurrentOperation.amountCents, 5528)
  assert.equal(concurrentOperation.status, "pending")
  assert.equal(
    concurrentOperation.checkoutReferenceId,
    createV3SquareSafeCheckoutReference({ orderId: concurrent.id })
  )

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: concurrent.id
    }),
    1
  )

  assert.equal(
    concurrentLock.owner,
    concurrent.lock.owner
  )

  console.log(
    "CONCURRENT PERSISTENCE CONSISTENCY: PASS"
  )
  console.log("SINGLE PAYMENT OPERATION: PASS")
  console.log("NO SQUARE PAYMENT CREATION: PASS")

  console.log("ALL V3 ATOMIC ORDER/PAYMENT TESTS PASSED")
  console.log("NO SQUARE API REQUESTS")

} catch (error) {
  console.error(
    "V3 ATOMIC ORDER/PAYMENT TEST FAILED:",
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
        .collection("smart_shipping_v3_checkout_locks")
        .deleteMany({ _id: { $in: ids } })

      await Order.deleteMany({
        _id: { $in: ids }
      })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error)
      process.exitCode = 1
    }
  }

  if (connected) {
    await mongoose.disconnect()
  }
}

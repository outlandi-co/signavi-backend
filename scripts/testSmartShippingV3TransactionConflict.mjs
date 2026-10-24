import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  markV3PaymentRequestStarted
} from "../utils/smartShippingV3PaymentState.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
let connected = false
let staleSession

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)
  await PaymentOperation.init()

  console.log("ISOLATED V3 DATABASE: PASS")

  const prepared = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(prepared.success, true)

  const owner = prepared.lock.owner
  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  staleSession = await mongoose.startSession()
  staleSession.startTransaction()

  const snapshot = await locks.findOne(
    { _id: orderId },
    { session: staleSession }
  )

  assert.ok(snapshot)
  assert.equal(snapshot.owner, owner)

  console.log("STALE TRANSACTION SNAPSHOT CREATED: PASS")

  const started = await markV3PaymentRequestStarted({
    orderId,
    owner,
    amountCents: 5528,
    idempotencyKey: prepared.operation.idempotencyKey
  })

  assert.equal(started.status, "reconciliation_required")
  assert.equal(started.requestOwner, owner)

  console.log("ATOMIC PAYMENT TRANSITION COMMITTED: PASS")

  let conflict = null

  try {
    await locks.updateOne(
      {
        _id: orderId,
        owner
      },
      {
        $set: {
          owner: "stale-transaction-replacement"
        }
      },
      {
        session: staleSession,
        maxTimeMS: 5000
      }
    )
  } catch (error) {
    conflict = error
  }

  assert.ok(
    conflict,
    "Expected stale transaction write to conflict."
  )

  assert.ok(
    conflict.code === 112 ||
    conflict.hasErrorLabel?.("TransientTransactionError"),
    `Unexpected conflict: ${conflict.message}`
  )

  console.log("STALE LOCK REPLACEMENT: PASS (write conflict)")

  await staleSession.abortTransaction()
  await staleSession.endSession()
  staleSession = null

  const savedLock = await locks.findOne({ _id: orderId })
  const savedPayment = await PaymentOperation.findOne({ orderId })

  assert.equal(savedLock.owner, owner)
  assert.equal(savedPayment.status, "reconciliation_required")
  assert.equal(savedPayment.requestOwner, owner)
  assert.equal(savedPayment.amountCents, 5528)
  assert.equal(
    savedPayment.idempotencyKey,
    prepared.operation.idempotencyKey
  )

  console.log("ORIGINAL LOCK OWNER PRESERVED: PASS")
  console.log("PAYMENT STATE PRESERVED: PASS")
  console.log("PAYMENT AMOUNT PRESERVED: PASS ($55.28)")
  console.log("IDEMPOTENCY KEY PRESERVED: PASS")
  console.log("ALL V3 TRANSACTION-CONFLICT TESTS PASSED")

} catch (error) {
  console.error("V3 TRANSACTION-CONFLICT TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (staleSession) {
    try {
      if (staleSession.inTransaction()) {
        await staleSession.abortTransaction()
      }
      await staleSession.endSession()
    } catch (error) {
      console.error("SESSION CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })

      await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .deleteOne({ _id: orderId })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
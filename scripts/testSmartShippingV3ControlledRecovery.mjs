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

import {
  recoverV3ExpiredUnstartedCheckout
} from "../utils/smartShippingV3ControlledRecovery.js"

const dbName = "signavi_shipping_v3_dev"
const ids = []

process.env.NODE_ENV = "development"
process.env.SQUARE_ENVIRONMENT = "sandbox"
process.env.SMART_SHIPPING_V3_ENABLED = "true"

let connected = false

const createCase = async ({ expired = false } = {}) => {
  const id = new mongoose.Types.ObjectId()
  ids.push(id)

  const result = await coordinateV3PaymentPreparation({
    orderId: id,
    amountCents: 5528
  })

  assert.equal(result.success, true)

  if (expired) {
    const changed = await mongoose.connection
      .collection("smart_shipping_v3_checkout_locks")
      .updateOne(
        {
          _id: id,
          owner: result.lock.owner
        },
        {
          $set: {
            expiresAt: new Date(Date.now() - 60000)
          }
        }
      )

    assert.equal(changed.matchedCount, 1)
  }

  return {
    id,
    lock: result.lock,
    operation: result.operation
  }
}

const readState = async id => ({
  operation: await PaymentOperation.findOne({
    orderId: id
  }).lean(),

  lock: await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .findOne({ _id: id })
})

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  console.log("ISOLATED V3 DATABASE: PASS")

  // Case 1: Expired, unstarted preparation.
  const expired = await createCase({ expired: true })
  const beforeRecovery = await readState(expired.id)

  const recovered = await recoverV3ExpiredUnstartedCheckout({
    orderId: expired.id,
    owner: expired.lock.owner
  })

  assert.equal(recovered.recovered, true)
  assert.equal(recovered.paymentOperationPreserved, true)
  assert.equal(recovered.squareRequestAuthorized, false)

  const afterRecovery = await readState(expired.id)

  assert.equal(afterRecovery.lock, null)
  assert.deepEqual(
    afterRecovery.operation,
    beforeRecovery.operation
  )

  console.log("EXPIRED UNSTARTED RECOVERY: PASS")
  console.log("PAYMENT OPERATION PRESERVED: PASS")

  // Case 2: Active preparation cannot be recovered.
  const active = await createCase()
  const activeBefore = await readState(active.id)

  await assert.rejects(
    recoverV3ExpiredUnstartedCheckout({
      orderId: active.id,
      owner: active.lock.owner
    }),
    /requires an expired owned lock/
  )

  assert.deepEqual(
    await readState(active.id),
    activeBefore
  )

  console.log("ACTIVE LOCK PROTECTED: PASS")

  // Case 3: Incorrect lock ownership.
  const wrongOwner = await createCase({
    expired: true
  })

  const wrongOwnerBefore = await readState(wrongOwner.id)

  await assert.rejects(
    recoverV3ExpiredUnstartedCheckout({
      orderId: wrongOwner.id,
      owner: "incorrect-owner"
    }),
    /lock ownership required/
  )

  assert.deepEqual(
    await readState(wrongOwner.id),
    wrongOwnerBefore
  )

  console.log("INCORRECT OWNER BLOCKED: PASS")

  // Case 4: Started payment cannot be recovered.
  const started = await createCase()

  const paymentStart = await markV3PaymentRequestStarted({
    orderId: started.id,
    owner: started.lock.owner,
    amountCents: 5528,
    idempotencyKey: started.operation.idempotencyKey
  })

  assert.equal(
    paymentStart.status,
    "reconciliation_required"
  )

  // Simulate lock expiration AFTER payment creation was claimed.
  // Recovery must preserve the started payment operation.
  const expiredStartedLock = await mongoose.connection
    .collection("smart_shipping_v3_checkout_locks")
    .updateOne(
      {
        _id: started.id,
        owner: started.lock.owner
      },
      {
        $set: {
          expiresAt: new Date(Date.now() - 60000)
        }
      }
    )

  assert.equal(expiredStartedLock.matchedCount, 1)

  console.log("STARTED PAYMENT LOCK EXPIRED: PASS")
  const startedBefore = await readState(started.id)

  await assert.rejects(
    recoverV3ExpiredUnstartedCheckout({
      orderId: started.id,
      owner: started.lock.owner
    }),
    /requires an unstarted payment operation/
  )

  assert.deepEqual(
    await readState(started.id),
    startedBefore
  )

  console.log("STARTED PAYMENT PROTECTED: PASS")
  console.log("RECONCILIATION STATE PRESERVED: PASS")

  console.log("ALL V3 CONTROLLED RECOVERY TESTS PASSED")
  console.log("NO SQUARE API REQUESTS")

} catch (error) {
  console.error(
    "V3 CONTROLLED RECOVERY TEST FAILED:",
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
        .deleteMany({
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
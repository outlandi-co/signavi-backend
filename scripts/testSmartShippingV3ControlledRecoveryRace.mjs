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
const locksName = "smart_shipping_v3_checkout_locks"
const ids = []

process.env.NODE_ENV = "development"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "sandbox"

let connected = false
let recoveryWins = 0
let paymentStartWins = 0

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)

  await PaymentOperation.init()

  console.log("ISOLATED V3 DATABASE: PASS")

  const locks = mongoose.connection.collection(locksName)

  for (let i = 0; i < 8; i++) {
    const orderId = new mongoose.Types.ObjectId()
    ids.push(orderId)

    const prepared = await coordinateV3PaymentPreparation({
      orderId,
      amountCents: 5528
    })

    assert.equal(prepared.success, true)

    const changed = await locks.updateOne(
      {
        _id: orderId,
        owner: prepared.lock.owner
      },
      {
        $set: {
          expiresAt: new Date(Date.now() - 60000)
        }
      }
    )

    assert.equal(changed.matchedCount, 1)

    const [recovery, start] = await Promise.allSettled([
      recoverV3ExpiredUnstartedCheckout({
        orderId,
        owner: prepared.lock.owner
      }),
      markV3PaymentRequestStarted({
        orderId,
        owner: prepared.lock.owner,
        amountCents: 5528,
        idempotencyKey: prepared.operation.idempotencyKey
      })
    ])

    const recovered =
      recovery.status === "fulfilled" &&
      recovery.value?.recovered === true

    const started =
      start.status === "fulfilled" &&
      start.value?.status === "reconciliation_required"

    assert.notEqual(
      recovered,
      started,
      "Exactly one operation must succeed."
    )

    const operation = await PaymentOperation.findOne({
      orderId
    }).lean()

    const lock = await locks.findOne({ _id: orderId })

    assert.ok(operation)
    assert.equal(operation.amountCents, 5528)
    assert.equal(
      operation.idempotencyKey,
      prepared.operation.idempotencyKey
    )

    assert.equal(
      await PaymentOperation.countDocuments({ orderId }),
      1
    )

    if (recovered) {
      assert.equal(start.status, "rejected")
      assert.equal(lock, null)
      assert.equal(operation.status, "pending")
      assert.equal(operation.requestOwner, "")
      recoveryWins++
    } else {
      assert.equal(recovery.status, "rejected")
      assert.ok(lock)
      assert.equal(lock.owner, prepared.lock.owner)
      assert.equal(
        operation.status,
        "reconciliation_required"
      )
      assert.equal(
        operation.requestOwner,
        prepared.lock.owner
      )
      paymentStartWins++
    }

    console.log(
      `RACE ${i + 1}: PASS (${recovered
        ? "controlled recovery"
        : "payment start"} won)`
    )
  }

  assert.equal(recoveryWins + paymentStartWins, 8)

  console.log(`CONTROLLED RECOVERY WINS: ${recoveryWins}`)
  console.log(`PAYMENT START WINS: ${paymentStartWins}`)
  console.log("8 CONTROLLED RECOVERY/START RACES: PASS")
  console.log("SINGLE PAYMENT OPERATION PER ORDER: PASS")
  console.log("LOCK AND PAYMENT STATE CONSISTENT: PASS")
  console.log("NO SQUARE REQUESTS: PASS")
  console.log("ALL V3 CONTROLLED RECOVERY RACE TESTS PASSED")

} catch (error) {
  console.error(
    "V3 CONTROLLED RECOVERY RACE TEST FAILED:",
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
        .collection(locksName)
        .deleteMany({ _id: { $in: ids } })

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
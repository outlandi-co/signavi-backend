import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation,
  releaseV3UnstartedPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
let connected = false

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

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      coordinateV3PaymentPreparation({
        orderId,
        amountCents: 5528
      })
    )
  )

  const winners = results.filter(result => result.success)
  const blocked = results.filter(
    result => result.reason === "checkout_in_progress"
  )

  assert.equal(winners.length, 1)
  assert.equal(blocked.length, 9)

  console.log("10 SIMULTANEOUS CHECKOUTS: PASS (1 winner)")
  console.log("9 COMPETING REQUESTS BLOCKED: PASS")

  const winner = winners[0]

  assert.equal(winner.operation.amountCents, 5528)
  assert.ok(winner.operation.idempotencyKey)

  const operations = await PaymentOperation.find({ orderId })
  assert.equal(operations.length, 1)
  assert.equal(
    operations[0].idempotencyKey,
    winner.operation.idempotencyKey
  )

  console.log("SINGLE PAYMENT OPERATION: PASS")
  console.log("STABLE PAYMENT TOTAL: PASS ($55.28)")
  console.log("STABLE IDEMPOTENCY KEY: PASS")

  const retry = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(retry.success, false)
  assert.equal(retry.reason, "checkout_in_progress")

  console.log("UNRELEASED LOCK BLOCKS RETRY: PASS")

  await assert.rejects(
    releaseV3UnstartedPreparation({
      lock: {
        ...winner.lock,
        owner: "not-the-lock-owner"
      }
    }),
    /ownership/
  )

  console.log("INCORRECT OWNER RELEASE BLOCKED: PASS")

  const released = await releaseV3UnstartedPreparation({
    lock: winner.lock
  })

  assert.equal(released, true)
  console.log("UNSTARTED PREPARATION RELEASE: PASS")

  const second = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(second.success, true)
  assert.equal(
    second.operation.idempotencyKey,
    winner.operation.idempotencyKey
  )

  console.log("REPREPARATION REUSES ORIGINAL KEY: PASS")

  await releaseV3UnstartedPreparation({
    lock: second.lock
  })

  console.log("ALL V3 PAYMENT COORDINATOR TESTS PASSED")

} catch (error) {
  console.error("V3 PAYMENT COORDINATOR TEST FAILED:", error)
  process.exitCode = 1

} finally {
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
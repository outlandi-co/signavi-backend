import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  coordinateV3PaymentPreparation,
  releaseV3UnstartedPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  markV3PaymentRequestStarted
} from "../utils/smartShippingV3PaymentState.js"

const dbName = "signavi_shipping_v3_dev"
const locksCollection = "smart_shipping_v3_checkout_locks"
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

  let releasesWon = 0
  let startsWon = 0

  for (let i = 0; i < 8; i++) {
    const orderId = new mongoose.Types.ObjectId()

    try {
      const prepared = await coordinateV3PaymentPreparation({
        orderId,
        amountCents: 5528
      })

      assert.equal(prepared.success, true)

      const args = {
        orderId,
        owner: prepared.lock.owner,
        amountCents: 5528,
        idempotencyKey: prepared.operation.idempotencyKey
      }

      const [release, start] = await Promise.allSettled([
        releaseV3UnstartedPreparation({
          lock: prepared.lock
        }),
        markV3PaymentRequestStarted(args)
      ])

      const releaseWon =
        release.status === "fulfilled" &&
        release.value === true

      const startWon =
        start.status === "fulfilled" &&
        start.value?.status === "reconciliation_required"

      assert.notEqual(
        releaseWon,
        startWon,
        "Exactly one conflicting operation must succeed."
      )

      const saved = await PaymentOperation.findOne({ orderId })
      const lock = await mongoose.connection
        .collection(locksCollection)
        .findOne({ _id: orderId })

      assert.ok(saved)
      assert.equal(saved.amountCents, 5528)
      assert.equal(
        saved.idempotencyKey,
        args.idempotencyKey
      )

      if (releaseWon) {
        assert.equal(start.status, "rejected")
        assert.equal(saved.status, "pending")
        assert.equal(saved.requestOwner, "")
        assert.equal(lock, null)
        releasesWon++
      } else {
        assert.equal(release.status, "rejected")
        assert.equal(saved.status, "reconciliation_required")
        assert.equal(saved.requestOwner, args.owner)
        assert.ok(lock)
        assert.equal(lock.owner, args.owner)
        startsWon++
      }

      console.log(
        `RACE ${i + 1}: PASS (${releaseWon ? "release" : "payment start"} won)`
      )

    } finally {
      await PaymentOperation.deleteMany({ orderId })
      await mongoose.connection
        .collection(locksCollection)
        .deleteOne({ _id: orderId })
    }
  }

  console.log(`SAFE RELEASE WINS: ${releasesWon}`)
  console.log(`SAFE PAYMENT START WINS: ${startsWon}`)
  console.log("8 CONCURRENT RELEASE/START RACES: PASS")
  console.log("PAYMENT STATE AND LOCK CONSISTENCY: PASS")
  console.log("ALL V3 RELEASE/START RACE TESTS PASSED")

} catch (error) {
  console.error("V3 RELEASE/START RACE TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (connected) {
    await mongoose.disconnect()
  }
}
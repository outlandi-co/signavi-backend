import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import {
  acquireV3CheckoutLock,
  releaseV3CheckoutLock
} from "../utils/smartShippingV3CheckoutLock.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const collection = "smart_shipping_v3_checkout_locks"

let connected = false

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true

  assert.equal(mongoose.connection.name, dbName)
  console.log("ISOLATED V3 DATABASE: PASS")

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      acquireV3CheckoutLock(orderId)
    )
  )

  const winners = attempts.filter(Boolean)

  assert.equal(winners.length, 1)
  console.log("10 CONCURRENT ATTEMPTS: PASS (1 winner)")

  const lock = winners[0]

  const competing = await acquireV3CheckoutLock(orderId)

  assert.equal(competing, null)
  console.log("DUPLICATE CHECKOUT BLOCKED: PASS")

  const fakeRelease = await releaseV3CheckoutLock({
    orderId: String(orderId),
    owner: "not-the-lock-owner"
  })

  assert.equal(fakeRelease, false)
  console.log("WRONG OWNER CANNOT RELEASE: PASS")

  const released = await releaseV3CheckoutLock(lock)

  assert.equal(released, true)
  console.log("OWNER RELEASE: PASS")

  const retry = await acquireV3CheckoutLock(orderId)

  assert.ok(retry)
  console.log("CHECKOUT RETRY AFTER RELEASE: PASS")

  assert.equal(await releaseV3CheckoutLock(retry), true)

  const interrupted = await acquireV3CheckoutLock(orderId)

  assert.ok(interrupted)

  await mongoose.connection
    .collection(collection)
    .updateOne(
      { _id: orderId, owner: interrupted.owner },
      { $set: { expiresAt: new Date(Date.now() - 60000) } }
    )

  const afterExpiry = await acquireV3CheckoutLock(orderId)

  assert.equal(
    afterExpiry,
    null,
    "Expired lock must remain blocked until reconciled."
  )

  console.log("INTERRUPTED PAYMENT STAYS LOCKED: PASS")
  console.log("EXPIRED LOCK CANNOT AUTO-RETRY: PASS")

  assert.equal(
    await releaseV3CheckoutLock(interrupted),
    true
  )

  console.log("OWNER-VERIFIED RECOVERY RELEASE: PASS")

  console.log("ALL V3 ATOMIC CHECKOUT LOCK TESTS PASSED")

} catch (error) {
  console.error("V3 CHECKOUT LOCK TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await mongoose.connection
        .collection(collection)
        .deleteOne({ _id: orderId })

      console.log("CLEANUP: Temporary checkout lock removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
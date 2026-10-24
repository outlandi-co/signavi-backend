import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const key = `signavi-v3-sandbox-${crypto.randomUUID()}`

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
  console.log("UNIQUE INDEXES READY: PASS")

  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      PaymentOperation.create({
        orderId,
        idempotencyKey: i === 0 ? key : `${key}-${i}`,
        amountCents: 5528 + i,
        environment: "sandbox",
        status: "pending"
      })
    )
  )

  const winners = attempts.filter(
    result => result.status === "fulfilled"
  )

  assert.equal(winners.length, 1)

  const rejected = attempts.filter(
    result => result.status === "rejected"
  )

  assert.equal(rejected.length, 9)

  for (const result of rejected) {
    assert.equal(result.reason?.code, 11000)
  }

  console.log("10 CONCURRENT OPERATIONS: PASS (1 winner)")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.ok(saved)
  assert.equal(saved.status, "pending")
  assert.equal(saved.environment, "sandbox")

  console.log("OPERATION PERSISTENCE: PASS")

  await assert.rejects(
    PaymentOperation.create({
      orderId: new mongoose.Types.ObjectId(),
      idempotencyKey: saved.idempotencyKey,
      amountCents: 9999,
      environment: "sandbox"
    }),
    error => error?.code === 11000
  )

  console.log("DUPLICATE IDEMPOTENCY KEY: PASS (rejected)")

  const reloaded = await PaymentOperation.findById(saved._id)

  assert.equal(reloaded.amountCents, saved.amountCents)
  assert.equal(reloaded.idempotencyKey, saved.idempotencyKey)

  console.log("SAVED PAYMENT AMOUNT: PASS")
  console.log("STABLE IDEMPOTENCY KEY: PASS")
  console.log("ALL V3 PAYMENT OPERATION TESTS PASSED")

} catch (error) {
  console.error("V3 PAYMENT OPERATION TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })
      console.log("CLEANUP: Temporary payment operation removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
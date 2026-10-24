import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"

const dbName = "signavi_shipping_v3_dev"
const collectionName = "smart_shipping_v3_transaction_tests"
const testId = new mongoose.Types.ObjectId()

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

  const collection = mongoose.connection.collection(
    collectionName
  )

  const session = await mongoose.startSession()

  try {
    await session.withTransaction(async () => {
      await collection.insertOne(
        {
          _id: testId,
          purpose: "V3 atomic ownership test",
          createdAt: new Date()
        },
        { session }
      )

      const inside = await collection.findOne(
        { _id: testId },
        { session }
      )

      assert.ok(inside)

      console.log("TRANSACTIONAL WRITE: PASS")
      console.log("TRANSACTIONAL READ: PASS")
    })
  } finally {
    await session.endSession()
  }

  const persisted = await collection.findOne({
    _id: testId
  })

  assert.ok(persisted)

  console.log("TRANSACTION COMMIT: PASS")

  console.log(
    "MONGODB TRANSACTIONS SUPPORTED FOR V3"
  )

} catch (error) {
  console.error(
    "V3 TRANSACTION SUPPORT TEST FAILED:",
    error.message
  )

  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await mongoose.connection
        .collection(collectionName)
        .deleteOne({ _id: testId })

      console.log("CLEANUP: Temporary test record removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
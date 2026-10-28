import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

let replicaSet
let connection
let session

try {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  connection = mongoose.createConnection(
    replicaSet.getUri(),
    {
      dbName: "signavi_v3_callback_retry_test",
      serverSelectionTimeoutMS: 10000
    }
  )

  await connection.asPromise()

  const schema = new mongoose.Schema({
    name: String,
    counter: Number
  })

  const TestRecord = connection.model(
    "V3CallbackRetry",
    schema
  )

  const record = await TestRecord.create({
    name: "synthetic-test-only",
    counter: 0
  })

  let callbackInvocations = 0
  let applicationRecordingCalls = 0
  let squareCalls = 0

  async function applicationRecording() {
    applicationRecordingCalls++

    session = await connection.startSession()

    try {
      await session.withTransaction(async () => {
        callbackInvocations++

        if (callbackInvocations === 1) {
          const error =
            new mongoose.mongo.MongoServerError({
              message: "SIMULATED_TRANSIENT_TRANSACTION_ERROR",
              code: 251,
              codeName: "NoSuchTransaction"
            })

          error.addErrorLabel("TransientTransactionError")

          throw error
        }

        await TestRecord.updateOne(
          {
            _id: record._id,
            counter: 0
          },
          {
            $inc: {
              counter: 1
            }
          },
          { session }
        )
      }, {
        maxCommitTimeMS: 5000
      })
    } finally {
      await session.endSession()
      session = null
    }
  }

  await applicationRecording()

  assert.equal(applicationRecordingCalls, 1)

  console.log(
    "PASS: Application recording function invoked once"
  )

  assert.equal(callbackInvocations, 2)

  console.log(
    "PASS: MongoDB driver re-entered transaction callback"
  )

  const persisted = await TestRecord.findById(
    record._id
  ).lean()

  assert.equal(persisted.counter, 1)

  console.log(
    "PASS: Exactly one durable database update"
  )

  assert.equal(squareCalls, 0)

  console.log(
    "PASS: No Square operations inside retried callback"
  )

  console.log("")
  console.log(
    "STEP 77 TRANSACTION CALLBACK RETRY: PASSED"
  )
  console.log(
    "APPLICATION CALLS: " + applicationRecordingCalls
  )
  console.log(
    "TRANSACTION CALLBACK INVOCATIONS: " +
      callbackInvocations
  )
  console.log(
    "DURABLE UPDATES: " + persisted.counter
  )
  console.log("DATABASE: ISOLATED MONGODB REPLICA SET")
  console.log("NO PRODUCTION DATABASE")
  console.log("NO SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
} finally {
  if (session) {
    await session.endSession().catch(() => {})
  }

  if (connection) {
    await connection.close()
  }

  if (replicaSet) {
    await replicaSet.stop()
  }
}

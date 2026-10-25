import "dotenv/config"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { readFile, writeFile, unlink } from "node:fs/promises"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

const original = "scripts/executeSmartShippingV3OneShotSandbox.mjs"
const temporary = "scripts/.v3-missing-fixture-regression.mjs"
const target = "6add930c3b60c62003d103a6"
const orderId = crypto.randomBytes(12).toString("hex")
const dbName = "signavi_shipping_v3_dev"

assert.ok(process.env.MONGO_URI)
assert.ok(["development", "test"].includes(process.env.NODE_ENV))
assert.equal(process.env.SQUARE_ENVIRONMENT, "sandbox")
assert.notEqual(process.env.SMART_SHIPPING_V3_ENABLED, "true")
assert.notEqual(process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED, "true")

const source = await readFile(original, "utf8")
assert.equal(source.split(target).length - 1, 1)

const temporarySource = source.replace(target, orderId)
let created = false
let connected = false

try {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })
  connected = true
  assert.equal(mongoose.connection.db.databaseName, dbName)

  const id = new mongoose.Types.ObjectId(orderId)

  const [order, operations, lock] = await Promise.all([
    Order.collection.findOne({ _id: id }),
    PaymentOperation.collection.find({ orderId: id }).toArray(),
    mongoose.connection.db
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id })
  ])

  assert.equal(order, null)
  assert.equal(operations.length, 0)
  assert.equal(lock, null)
  console.log("RANDOM FIXTURE ABSENT: PASS")

  await mongoose.disconnect()
  connected = false

  // Exclusive creation prevents replacing an existing file.
  await writeFile(temporary, temporarySource, { flag: "wx" })
  created = true

  const syntax = spawnSync(process.execPath, ["--check", temporary], {
    encoding: "utf8",
    timeout: 10000
  })
  assert.equal(syntax.error, undefined)
  assert.equal(syntax.status, 0)

  const result = spawnSync(
    process.execPath,
    [temporary, "--execute", orderId],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        SQUARE_ENVIRONMENT: "sandbox",
        SIGNAVI_V3_SANDBOX_ONE_SHOT_APPROVAL: orderId,
        SMART_SHIPPING_V3_ENABLED: "true",
        SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "true",
        SQUARE_SANDBOX_ACCESS_TOKEN: "",
        SQUARE_SANDBOX_MERCHANT_ID: "",
        SQUARE_SANDBOX_LOCATION_ID: "",
        SQUARE_ACCESS_TOKEN: "",
        NODE_OPTIONS: ""
      },
      encoding: "utf8",
      timeout: 15000
    }
  )

  assert.equal(result.error, undefined)
  assert.notEqual(result.status, 0)

  const output = `${result.stdout}\n${result.stderr}`

  assert.ok(
    output.includes("ONE-SHOT SANDBOX STOPPED: fixture_not_pending")
  )
  assert.ok(!output.includes("SANDBOX PAYMENT LINK VERIFIED"))
  assert.ok(!output.includes("INSPECT PERSISTED STATE"))

  console.log("POST-DATABASE FIXTURE REJECTION: PASS")
  console.log("NO RESERVATION STARTED: PASS")
  console.log("NO REAL SQUARE REQUESTS: PASS")
} finally {
  if (connected) await mongoose.disconnect()
  if (created) {
    await unlink(temporary)
    console.log("TEMPORARY LAUNCHER CLEANED: PASS")
  }
}
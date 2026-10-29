import assert from "node:assert/strict"
import crypto from "node:crypto"
import vm from "node:vm"
import { readFileSync } from "node:fs"
import mongoose from "mongoose"
import "dotenv/config"
import SourceOrder from "../models/Order.js"
import SourceOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"

import {
  verifyV3WebhookPaymentBinding
} from "../utils/smartShippingV3WebhookPaymentBinding.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

const DB = "signavi_shipping_v3_recovery_tests"
const ORDERS = "v3_mongoose_integrated_webhook_orders_synthetic"
const OPERATIONS = "v3_mongoose_integrated_webhook_operations_synthetic"

const uri =
  process.env.SIGNAVI_V3_TEST_MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI

assert.ok(uri, "STOP: Test MongoDB URI missing")

const source = readFileSync(
  new URL("../routes/squareWebhook.js", import.meta.url),
  "utf8"
)

const start = source.indexOf("const router = express.Router()")
const end = source.lastIndexOf("export default router")

assert.ok(start >= 0 && end > start, "Route boundaries changed")

const routeBody = source.slice(start, end)
const signatureKey = "synthetic-webhook-test-key"
const notificationUrl = "https://synthetic.invalid/webhook"
const locationId = "synthetic-location"

const runId = `v3-persisted-${crypto.randomUUID()}`
const createdOrderIds = []

const createAdapter = Model => ({
  insertOne: async document => {
    const instance = new Model(document)
    await instance.validate()
    await instance.save()
    return { insertedId: instance._id }
  },

  findOne: query =>
    Model.findOne(query).lean(),

  findOneAndUpdate: (query, update) =>
    Model.findOneAndUpdate(
      query,
      update,
      { returnDocument: "after" }
    ).lean(),

  deleteMany: query =>
    Model.deleteMany(query)
})
let connected = false
let orderCollection
let operationCollection

const makeFixture = async () => {
  const id = new mongoose.Types.ObjectId()
  const orderId = String(id)
  const reference = createV3SquareSafeCheckoutReference({ orderId })

  const suffix = crypto.randomUUID()
  const squareOrderId = `synthetic-square-${suffix}`
  const paymentId = `synthetic-payment-${suffix}`

  const paymentUrl = `https://sandbox.square.link/u/synthetic-${suffix}`
  const squarePaymentLinkId = `synthetic-link-${suffix}`

  const order = {
    _id: id,
    runId,
    syntheticTestOnly: true,
    customerName: "Synthetic Webhook Test",
    email: "synthetic@example.invalid",
    source: "store",
    finalPrice: 1,
    currency: "usd",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squareOrderId: "",
    squarePaymentId: "",
    squarePaymentLinkId,
    paymentUrl,
    timeline: []
  }

  const operation = {
    orderId: id,
    runId,
    syntheticTestOnly: true,
    environment: "sandbox",
    status: "completed",
    checkoutReferenceId: reference,
    requestOwner: "synthetic-owner",
    idempotencyKey: `signavi-v3-sandbox-synthetic-${suffix}`,
    amountCents: 100,
    squarePaymentLinkId,
    squareOrderId,
    paymentUrl
  }

  // Record the ID before inserting, so cleanup covers partial setup.
  createdOrderIds.push(id)

  await orderCollection.insertOne(order)
  await operationCollection.insertOne(operation)

  return {
    id,
    orderId,
    reference,
    squareOrderId,
    paymentId
  }
}

const buildHandler = ({
  fixture,
  amount = 100
}) => {
  let handler

  const verifiedPayment = {
    id: fixture.paymentId,
    status: "COMPLETED",
    order_id: fixture.squareOrderId,
    location_id: locationId,
    amount_money: {
      amount,
      currency: "USD"
    }
  }

  const verifiedSquareOrder = {
    id: fixture.squareOrderId,
    reference_id: fixture.reference,
    location_id: locationId,
    total_money: {
      amount,
      currency: "USD"
    }
  }

  let updateAttempts = 0
  let successfulUpdates = 0
  let squareLookups = 0

  const Order = {
    findOne: query => orderCollection.findOne(query),

    findById: id =>
      orderCollection.findOne({
        _id: new mongoose.Types.ObjectId(String(id)),
        runId,
        syntheticTestOnly: true
      }),

    findOneAndUpdate: async (filter, update) => {
      updateAttempts++

      assert.equal(filter.squareEnvironment, "sandbox")

      // The actual route supplies the MongoDB query and mutation.
      // Add only test-run ownership restrictions to its filter.
      const result = await orderCollection.findOneAndUpdate(
        {
          ...filter,
          runId,
          syntheticTestOnly: true
        },
        update,
        { returnDocument: "after" }
      )

      if (result) successfulUpdates++
      return result
    },

    updateOne: async () => {
      throw new Error("Unexpected receipt database update")
    }
  }

  const Invoice = {
    find: () => ({
      limit: async () => []
    }),
    findOneAndUpdate: async () => {
      throw new Error("Unexpected invoice update")
    },
    findById: async () => null
  }

  const SmartShippingV3PaymentOperation = {
    findOne: query => ({
      lean: async () =>
        operationCollection.findOne({
          ...query,
          runId,
          syntheticTestOnly: true
        })
    })
  }

  const mockedFetch = async url => {
    squareLookups++

    if (url.endsWith(`/v2/payments/${fixture.paymentId}`)) {
      return {
        ok: true,
        json: async () => ({ payment: verifiedPayment })
      }
    }

    if (url.endsWith(`/v2/orders/${fixture.squareOrderId}`)) {
      return {
        ok: true,
        json: async () => ({ order: verifiedSquareOrder })
      }
    }

    throw new Error("Blocked unexpected Square endpoint")
  }

  const context = {
    express: {
      Router: () => ({
        post: (path, callback) => {
          assert.equal(path, "/webhook")
          handler = callback
        }
      })
    },
    crypto,
    fetch: mockedFetch,
    Order,
    Quote: {
      findById: () => ({
        select: async () => null
      })
    },
    Invoice,
    Notification: {
      create: async () => {
        throw new Error("Notifications disabled")
      }
    },
    SmartShippingV3PaymentOperation,
    getSquareAccessToken: () => "synthetic-test-token",
    getSquareLocationId: () => locationId,
    sendReceiptEmail: async () => {
      throw new Error("Receipts disabled")
    },
    parseV3WebhookOrderReference,
    verifyV3WebhookPaymentBinding: (...args) => {
      const input = args[0] || {}
      const result = verifyV3WebhookPaymentBinding(...args)

      const summary = {}

      for (const [key, value] of Object.entries(result || {})) {
        if (typeof value === "boolean" || value === null) {
          summary[key] = value
        } else if (
          ["reason", "code", "error", "status"].includes(key) &&
          typeof value === "string"
        ) {
          summary[key] = value.slice(0, 120)
        } else {
          summary[key] = `[${typeof value}]`
        }
      }

      console.log("PERSISTED BINDING RESULT", summary)

      console.log("PERSISTED BINDING INPUT SHAPE", {
        keys: Object.keys(input),
        orderPresent: Boolean(input.order),
        operationPresent: Boolean(
          input.operation ||
          input.paymentOperation ||
          input.v3Operation
        ),
        paymentPresent: Boolean(input.payment),
        squareOrderPresent: Boolean(input.squareOrder)
      })

      return result
    },
    process: {
      env: {
        SQUARE_ENVIRONMENT: "sandbox",
        SQUARE_WEBHOOK_SIGNATURE_KEY: signatureKey,
        SQUARE_WEBHOOK_URL: notificationUrl,
        SQUARE_ACCESS_TOKEN: "synthetic-test-token",
        SQUARE_LOCATION_ID: locationId
      }
    },
    Buffer,
    AbortSignal,
    Date,
    console: {
      log(...args) { console.log("[WEBHOOK]", ...args) },
      warn(...args) { console.warn("[WEBHOOK]", ...args) },
      error(...args) {
        // Synthetic diagnostic only; no live credentials are used.
        console.error(...args)
      }
    }
  }

  vm.runInNewContext(routeBody, context, {
    filename: "persisted-webhook-test.js",
    timeout: 2000
  })

  assert.equal(typeof handler, "function")

  const deliver = async ({ validSignature = true } = {}) => {
    const body = Buffer.from(JSON.stringify({
      type: "payment.updated",
      data: {
        object: {
          payment: {
            id: fixture.paymentId,
            status: "COMPLETED"
          }
        }
      }
    }))

    const signature = crypto
      .createHmac("sha256", signatureKey)
      .update(notificationUrl, "utf8")
      .update(body)
      .digest("base64")

    let statusCode

    await handler({
      body,
      headers: {
        "x-square-hmacsha256-signature":
          validSignature ? signature : "invalid-signature"
      },
      app: { get: () => null }
    }, {
      sendStatus(code) {
        statusCode = code
        return this
      }
    })

    assert.ok(statusCode, "Missing webhook response")
    return statusCode
  }

  return {
    deliver,
    get updateAttempts() { return updateAttempts },
    get successfulUpdates() { return successfulUpdates },
    get squareLookups() { return squareLookups }
  }
}

try {
  await mongoose.connect(uri, {
    dbName: DB,
    serverSelectionTimeoutMS: 7000,
    maxPoolSize: 5,
    autoIndex: false
  })

  connected = true

  assert.equal(
    mongoose.connection.db.databaseName,
    DB,
    "STOP: Unexpected MongoDB database"
  )

  assert.notEqual(ORDERS, SourceOrder.collection.name)
  assert.notEqual(OPERATIONS, SourceOperation.collection.name)

  const orderSchema = SourceOrder.schema.clone()
  const operationSchema = SourceOperation.schema.clone()

  // Retain ownership markers in the cloned test-only schemas.
  orderSchema.add({
    runId: { type: String, required: true },
    syntheticTestOnly: { type: Boolean, required: true }
  })

  operationSchema.add({
    runId: { type: String, required: true },
    syntheticTestOnly: { type: Boolean, required: true }
  })

  const SyntheticOrder = mongoose.connection.model(
    "V3IntegratedWebhookSyntheticOrder",
    orderSchema,
    ORDERS
  )

  const SyntheticOperation = mongoose.connection.model(
    "V3IntegratedWebhookSyntheticOperation",
    operationSchema,
    OPERATIONS
  )

  orderCollection = createAdapter(SyntheticOrder)
  operationCollection = createAdapter(SyntheticOperation)

  console.log("REAL MONGOOSE MODEL ADAPTERS: READY")

  // First confirmation and exact duplicate use actual persistence.
  {
    const fixture = await makeFixture()
    const test = buildHandler({ fixture })

    assert.equal(
      await test.deliver({ validSignature: false }),
      401
    )
    assert.equal(test.squareLookups, 0)
    assert.equal(test.updateAttempts, 0)
    console.log("PERSISTED INVALID SIGNATURE: REJECTED")

    assert.equal(await test.deliver(), 200)

    const paid = await orderCollection.findOne({
      _id: fixture.id,
      runId,
      syntheticTestOnly: true
    })

    console.log("PERSISTED FIRST DELIVERY DIAGNOSTIC", {
      paymentStatus: paid?.paymentStatus,
      orderStatus: paid?.status,
      updateAttempts: test.updateAttempts,
      successfulUpdates: test.successfulUpdates,
      squareLookups: test.squareLookups,
      timelineLength: paid?.timeline?.length
    })

    assert.equal(paid.paymentStatus, "paid")
    assert.equal(paid.status, "paid")
    assert.equal(paid.squarePaymentId, fixture.paymentId)
    assert.equal(paid.squareOrderId, fixture.squareOrderId)
    assert.equal(paid.timeline.length, 2)
    assert.equal(test.successfulUpdates, 1)

    console.log("PERSISTED FIRST WEBHOOK PAYMENT: PASS")

    assert.equal(await test.deliver(), 200)

    const replayed = await orderCollection.findOne({
      _id: fixture.id,
      runId,
      syntheticTestOnly: true
    })

    assert.equal(replayed.timeline.length, 2)
    assert.equal(replayed.squarePaymentId, fixture.paymentId)
    assert.equal(test.successfulUpdates, 1)
    assert.equal(test.updateAttempts, 1)

    console.log("PERSISTED EXACT REPLAY: NO SECOND WRITE")
  }

  // Wrong amount must never update the persisted order.
  {
    const fixture = await makeFixture()
    const test = buildHandler({
      fixture,
      amount: 200
    })

    assert.equal(await test.deliver(), 200)
    assert.equal(test.updateAttempts, 0)

    const saved = await orderCollection.findOne({
      _id: fixture.id,
      runId,
      syntheticTestOnly: true
    })

    assert.equal(saved.paymentStatus, "unpaid")
    assert.equal(saved.timeline.length, 1)

    console.log("PERSISTED AMOUNT MISMATCH: NO WRITE")
  }

  // Simultaneous signed deliveries must produce one paid transition.
  {
    const fixture = await makeFixture()
    const test = buildHandler({ fixture })

    const statuses = await Promise.all([
      test.deliver(),
      test.deliver()
    ])

    assert.deepEqual(statuses, [200, 200])

    const saved = await orderCollection.findOne({
      _id: fixture.id,
      runId,
      syntheticTestOnly: true
    })

    assert.equal(saved.paymentStatus, "paid")
    assert.equal(saved.squarePaymentId, fixture.paymentId)
    assert.equal(saved.timeline.length, 2)
    assert.equal(test.successfulUpdates, 1)

    console.log("PERSISTED CONCURRENT DELIVERIES: ONE WRITE")
  }

  console.log("ALL MONGOOSE-INTEGRATED WEBHOOK SCENARIOS: PASS")
  console.log("DATABASE:", DB)
  console.log("SYNTHETIC ORDER COLLECTION:", ORDERS)
  console.log("SYNTHETIC OPERATION COLLECTION:", OPERATIONS)
} finally {
  if (connected) {
    try {
      if (orderCollection && operationCollection) {
        const filter = {
          _id: { $in: createdOrderIds },
          runId,
          syntheticTestOnly: true
        }

        const orderCleanup = await orderCollection.deleteMany(filter)

        const operationCleanup =
          await operationCollection.deleteMany({
            orderId: { $in: createdOrderIds },
            runId,
            syntheticTestOnly: true
          })

        assert.equal(
          orderCleanup.deletedCount,
          createdOrderIds.length,
          "STOP: Synthetic order cleanup incomplete"
        )

        assert.equal(
          operationCleanup.deletedCount,
          createdOrderIds.length,
          "STOP: Synthetic operation cleanup incomplete"
        )

        console.log(
          "SYNTHETIC ORDERS CLEANED:",
          orderCleanup.deletedCount
        )

        console.log(
          "SYNTHETIC OPERATIONS CLEANED:",
          operationCleanup.deletedCount
        )
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}

console.log("NO EXISTING ORDER OR PAYMENT COLLECTION MODIFIED")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO DEPLOYMENT")
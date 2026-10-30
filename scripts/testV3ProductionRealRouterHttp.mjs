import test from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import http from "node:http"
import https from "node:https"

// Configure the isolated test before importing application modules.
process.env.NODE_ENV = "test"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "production"

delete process.env.MONGO_URI
delete process.env.MONGODB_URI
delete process.env.SQUARE_ACCESS_TOKEN
delete process.env.SQUARE_TOKEN

delete process.env.SMART_SHIPPING_V3_SANDBOX_HTTP_ENABLED
delete process.env.SMART_SHIPPING_V3_SANDBOX_PREPARE_ENABLED
delete process.env.SMART_SHIPPING_V3_DURABLE_PREPARE_ENABLED
delete process.env.SMART_SHIPPING_V3_DURABLE_WORKFLOW_TEST_ENABLED

process.env.SHIPPING_QUOTE_SECRET =
  crypto.randomBytes(32).toString("hex")

process.env.SHIPPING_V3_QUOTE_SECRET =
  crypto.randomBytes(48).toString("hex")

test("real orders router keeps V3 production checkout locked", {
  timeout: 120000
}, async () => {
  const { default: express } = await import("express")
  const { default: mongoose } = await import("mongoose")
  const { MongoMemoryReplSet } = await import(
    "mongodb-memory-server"
  )

  let replica
  let server

  try {
    replica = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: "wiredTiger"
      }
    })

    const dbName =
      `signavi_v3_real_router_${crypto.randomBytes(6).toString("hex")}`

    await mongoose.connect(replica.getUri(dbName), {
      serverSelectionTimeoutMS: 10000,
      monitorCommands: true
    })

    assert.equal(mongoose.connection.name, dbName)

    const { default: Order } = await import("../models/Order.js")
    const { default: orderRoutes } = await import("../routes/orders.js")

    const {
      createGuestCheckoutToken
    } = await import("../utils/guestCheckoutToken.js")

    const {
      getSmartShippingCheckoutVersion
    } = await import("../utils/smartShippingV3FeatureFlags.js")

    assert.equal(getSmartShippingCheckoutVersion(), "v3")
    assert.equal(process.env.SQUARE_ENVIRONMENT, "production")

    console.log("PASS: Isolated MongoDB and V3 production flags")

    const orderId = new mongoose.Types.ObjectId()

    const order = await new Order({
      _id: orderId,
      source: "store",
      status: "payment_required",
      paymentStatus: "unpaid",
      customerName: "V3 Real Router Test",
      email: "real-router-test@example.com",
      address: {
        street: "123 Test Street",
        city: "Test City",
        state: "CA",
        zip: "90001",
        country: "US"
      },
      subtotal: 39.98,
      tax: 3.30,
      finalPrice: 43.28,
      items: [{
        productId: new mongoose.Types.ObjectId(),
        quantity: 2,
        finalPrice: 19.99,
        variant: {
          color: "black",
          size: "L"
        }
      }]
    }).save()

    const token = createGuestCheckoutToken(order)
    assert.ok(typeof token === "string" && token.length > 0)

    const app = express()
    app.use(express.json())
    app.use("/api/orders", orderRoutes)

    server = app.listen(0, "127.0.0.1")

    await new Promise((resolve, reject) => {
      if (server.listening) return resolve()
      server.once("listening", resolve)
      server.once("error", reject)
    })

    const address = server.address()

    assert.ok(address && typeof address !== "string")

    const url =
      `http://127.0.0.1:${address.port}` +
      `/api/orders/${orderId}/checkout`

    const checkout = async (guestToken, body = {}) => {
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          ...(guestToken
            ? { "x-signavi-guest-checkout-token": guestToken }
            : {})
        },
        body: JSON.stringify(body)
      })

      return {
        status: response.status,
        body: await response.json()
      }
    }

    // Counts all existing non-order collections. We will compare
    // the full collection set and counts after checkout requests.
    // Snapshot all non-order documents, including their contents.
    // Mongoose may create an empty collection while initializing
    // a model, so empty collections are intentionally omitted.
    const getNonOrderState = async () => {
      const collections = await mongoose.connection.db
        .listCollections({}, { nameOnly: true })
        .toArray()

      const state = {}

      for (const { name } of collections) {
        if (
          name === Order.collection.name ||
          name.startsWith("system.")
        ) {
          continue
        }

        const documents = await mongoose.connection.db
          .collection(name)
          .find({})
          .sort({ _id: 1 })
          .toArray()

        if (documents.length === 0) {
          continue
        }

        state[name] = documents.map(document =>
          JSON.stringify(document)
        )
      }

      return state
    }
    // Initialize every model used by the production inspection
    // BEFORE starting MongoDB command monitoring.
    // These imports and index builds use isolated MongoDB only.
    await Promise.all([
      import("../models/Product.js"),
      import("../models/SquarePaymentCreationReservation.js"),
      import("../models/SharedSquarePaymentReservation.js"),
      import("../models/SmartShippingV3ProductionPurchaseReservation.js"),
      import("../models/SmartShippingV3PaymentOperation.js")
    ])

    const initializedModels = mongoose.modelNames()

    await Promise.all(
      initializedModels.map(name =>
        mongoose.model(name).init()
      )
    )

    console.log(
      "PASS: Mongoose models initialized before HTTP write monitoring",
      initializedModels.length
    )
    const initialNonOrderState = await getNonOrderState()

    // Test-only outbound HTTP interception.
    // Local test-server traffic remains available.
    // Every attempted external request is counted and blocked.
    const externalAttempts = []

    const isLocalHost = hostname => {
      const host = String(hostname || "")
        .toLowerCase()
        .replace(/^\[|\]$/g, "")

      return [
        "127.0.0.1",
        "::1",
        "localhost"
      ].includes(host)
    }

    const getHost = args => {
      const input = args[0]

      if (typeof input === "string" || input instanceof URL) {
        try {
          return new URL(input).hostname
        } catch {
          return ""
        }
      }

      if (input && typeof input === "object") {
        if (input.hostname) return String(input.hostname)
        if (input.host) return String(input.host).split(":")[0]
      }

      const options = args.find(
        item => item &&
          typeof item === "object" &&
          !(item instanceof URL) &&
          (item.hostname || item.host)
      )

      return String(options?.hostname || options?.host || "")
        .split(":")[0]
    }

    const blockExternal = (hostname, transport) => {
      if (!isLocalHost(hostname)) {
        externalAttempts.push({
          hostname: String(hostname || "unknown"),
          transport
        })

        throw new Error(
          "TEST_EXTERNAL_HTTP_REQUEST_BLOCKED"
        )
      }
    }

    const originalFetch = globalThis.fetch
    const originalHttpRequest = http.request
    const originalHttpsRequest = https.request
    const originalHttpGet = http.get
    const originalHttpsGet = https.get

    globalThis.fetch = (...args) => {
      const hostname = getHost(args)
      blockExternal(hostname, "fetch")
      return originalFetch(...args)
    }

    http.request = function (...args) {
      blockExternal(getHost(args), "http.request")
      return originalHttpRequest.apply(this, args)
    }

    https.request = function (...args) {
      blockExternal(getHost(args), "https.request")
      return originalHttpsRequest.apply(this, args)
    }

    http.get = function (...args) {
      blockExternal(getHost(args), "http.get")
      return originalHttpGet.apply(this, args)
    }

    https.get = function (...args) {
      blockExternal(getHost(args), "https.get")
      return originalHttpsGet.apply(this, args)
    }

    // Monitor actual database write commands during HTTP checkout.
    // Do not capture order creation or the later explicit paid-order update.
    // Positive controls must fail synchronously, before network I/O.
    // The .invalid hostname is reserved for testing, not Square.
    const blockedTestUrl =
      "https://checkout-intercept.invalid/blocked"

    assert.throws(
      () => globalThis.fetch(blockedTestUrl),
      /TEST_EXTERNAL_HTTP_REQUEST_BLOCKED/
    )

    assert.throws(
      () => https.request(blockedTestUrl),
      /TEST_EXTERNAL_HTTP_REQUEST_BLOCKED/
    )

    assert.deepEqual(
      externalAttempts.map(attempt => attempt.transport),
      ["fetch", "https.request"]
    )

    assert.ok(
      externalAttempts.every(
        attempt =>
          attempt.hostname === "checkout-intercept.invalid"
      )
    )

    console.log(
      "PASS: Positive controls blocked fetch and HTTPS request"
    )

    // Reset only the expected positive-control observations.
    // Checkout requests must produce zero new external attempts.
    externalAttempts.length = 0
    const mongoWriteCommands = []
    const watchedCommands = new Set([
      "insert",
      "update",
      "delete",
      "findAndModify",
      "create",
      "createIndexes",
      "drop",
      "dropIndexes",
      "renameCollection",
      "dropDatabase",
      "commitTransaction"
    ])

    let monitorCheckoutWrites = true

    mongoose.connection.getClient().on("commandStarted", event => {
      if (
        monitorCheckoutWrites &&
        watchedCommands.has(event.commandName)
      ) {
        mongoWriteCommands.push({
          command: event.commandName,
          collection: String(
            event.command?.insert ||
            event.command?.update ||
            event.command?.delete ||
            event.command?.findAndModify ||
            event.command?.create ||
            event.command?.createIndexes ||
            ""
          )
        })
      }
    })

    const missing = await checkout(null)

    assert.equal(missing.status, 403)
    console.log("PASS: Missing guest token returns 403")

    const invalid = await checkout("invalid-token")

    assert.equal(invalid.status, 403)
    console.log("PASS: Invalid guest token returns 403")

    const valid = await checkout(token, {
      squareRequestAuthorized: true,
      productionEnabled: true,
      totalCents: 1
    })

    assert.equal(valid.status, 423)
    assert.equal(
      valid.body.code,
      "V3_PRODUCTION_CHECKOUT_NOT_ACTIVATED"
    )
    assert.equal(valid.body.paymentCreated, false)
    assert.equal(valid.body.squareRequestAuthorized, false)

    console.log("PASS: Valid guest token returns production HTTP 423")

    const results = await Promise.all(
      Array.from({ length: 12 }, () => checkout(token, {
        productionEnabled: true,
        squareRequestAuthorized: true
      }))
    )

    for (const result of results) {
      assert.equal(result.status, 423)
      assert.equal(result.body.paymentCreated, false)
      assert.equal(result.body.squareRequestAuthorized, false)
    }

    console.log("PASS: 12 concurrent real-router requests returned 423")

    const unchangedOrder = await Order.findById(orderId).lean()

    assert.equal(unchangedOrder.status, "payment_required")
    assert.equal(unchangedOrder.paymentStatus, "unpaid")
    assert.equal(unchangedOrder.finalPrice, 43.28)

    const afterCheckoutState = await getNonOrderState()

    assert.deepEqual(afterCheckoutState, initialNonOrderState)

    console.log("PASS: No non-order documents added, removed, or modified")

    // All real-router HTTP checkout requests have completed.
    monitorCheckoutWrites = false

    assert.deepEqual(
      mongoWriteCommands,
      [],
      "Checkout issued a MongoDB write or schema command"
    )

    assert.deepEqual(
      externalAttempts,
      [],
      "Checkout attempted an external HTTP request"
    )

    console.log(
      "PASS: Zero attempted external HTTP requests"
    )

    console.log(
      "PASS: Zero MongoDB write/schema commands during checkout"
    )
    // Test paid-order rejection only after the no-write snapshot.
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          status: "paid",
          paymentStatus: "paid"
        }
      }
    )

    const paid = await checkout(token)

    assert.equal(paid.status, 409)

    console.log("PASS: Paid orders return 409")

    const finalNonOrderState = await getNonOrderState()

    assert.deepEqual(finalNonOrderState, initialNonOrderState)

    console.log("PASS: No payment-related records added")
    console.log("PASS: Actual orders router exercised")
    console.log("PASS: No Square payment execution authorized")
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error =>
          error ? reject(error) : resolve()
        )
      })
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }

    if (replica) {
      await replica.stop()
    }
  }
})
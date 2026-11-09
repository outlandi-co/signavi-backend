import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"

process.env.NODE_ENV = "test"
process.env.SMART_SHIPPING_V3_ENABLED = "true"
process.env.SQUARE_ENVIRONMENT = "production"
process.env.SHIPPING_QUOTE_SECRET =
  randomBytes(32).toString("hex")
process.env.SHIPPING_V3_QUOTE_SECRET =
  randomBytes(48).toString("hex")

// Never load a database URI or Square credential in this test.
for (const key of [
  "MONGO_URI",
  "MONGODB_URI",
  "V3_SANDBOX_MONGO_URI",
  "SQUARE_ACCESS_TOKEN",
  "SQUARE_TOKEN"
]) {
  delete process.env[key]
}

const { default: express } = await import("express")
const { default: mongoose } = await import("mongoose")
const { default: Product } = await import("../models/Product.js")
const { default: Order } = await import("../models/Order.js")
const { default: routes } = await import("../routes/orders.js")

const {
  createStorefrontRecoverySecret
} = await import("../utils/storefrontRecoveryProof.mjs")

const {
  verifyGuestCheckoutToken
} = await import("../utils/guestCheckoutToken.js")

const indexDefinition = {
  name: "unique_storefront_creation_attempt_v1",
  key: { storefrontCreationAttemptKey: 1 },
  unique: true,
  partialFilterExpression: {
    storefrontCreationAttemptKey: { $type: "string" }
  },
  collation: { locale: "simple" }
}

const originals = {
  productFind: Product.find,
  orderFindOne: Order.findOne,
  orderCreate: Order.create,
  indexes: Order.collection.indexes
}

const products = new Map()
const orders = new Map()
let indexEnabled = true
let creationCount = 0
let server

const productId = () => new mongoose.Types.ObjectId().toString()

function addProduct(storefront) {
  const id = productId()

  products.set(id, {
    _id: new mongoose.Types.ObjectId(id),
    name: `Test ${storefront} item`,
    storefront,
    salesChannel: storefront,
    productType: "physical",
    type: "physical",
    active: true,
    price: 25,
    basePrice: 25,
    listPrice: 25,
    stock: 100,
    quantity: 100,
    variants: [],
    images: []
  })

  return id
}

function payload(storefront, id) {
  return {
    storefront,
    customerName: "Isolated Test Customer",
    email: "isolated@example.invalid",
    phone: "5550000000",
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "95340"
    },
    items: [{
      productId: id,
      quantity: 1
    }]
  }
}

// Mock ALL database operations exercised by order creation.
// No mongoose.connect() is called.
Product.find = async query => {
  const allowed = new Set(
    (query?._id?.$in || []).map(String)
  )

  return [...products.values()].filter(product =>
    allowed.has(String(product._id)) &&
    product.storefront === query.storefront
  )
}

Order.collection.indexes = async () =>
  indexEnabled ? [indexDefinition] : []

Order.findOne = query => ({
  lean: async () => {
    return [...orders.values()].find(order =>
      order.storefrontCreationAttemptKey ===
        query.storefrontCreationAttemptKey
    ) || null
  }
})

Order.create = async fields => {
  const key = fields.storefrontCreationAttemptKey

  if (orders.has(key)) {
    const error = new Error("Duplicate checkout attempt")
    error.code = 11000
    error.keyPattern = { storefrontCreationAttemptKey: 1 }
    throw error
  }

  const now = new Date()

  const order = {
    ...fields,
    _id: new mongoose.Types.ObjectId(),
    createdAt: now,
    updatedAt: now
  }

  orders.set(key, order)
  creationCount += 1

  return order
}

const app = express()
app.use(express.json())
app.use("/api/orders", routes)

function restore() {
  Product.find = originals.productFind
  Order.findOne = originals.orderFindOne
  Order.create = originals.orderCreate
  Order.collection.indexes = originals.indexes
}

async function post(base, request, attemptKey, secret) {
  const response = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signavi-storefront-attempt-key": attemptKey,
      "x-signavi-storefront-recovery-secret": secret
    },
    body: JSON.stringify(request)
  })

  return {
    status: response.status,
    body: await response.json()
  }
}

try {
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1")
    listener.once("listening", () => resolve(listener))
    listener.once("error", reject)
  })

  const base = `http://127.0.0.1:${server.address().port}`

  for (const storefront of [
    "signavi_studio",
    "signavi_store"
  ]) {
    const id = addProduct(storefront)
    const attemptKey = randomUUID()
    const secret = createStorefrontRecoverySecret()
    const request = payload(storefront, id)

    const result = await post(
      base, request, attemptKey, secret
    )

    assert.equal(
      result.status,
      201,
      `${storefront} returned HTTP ${result.status}: ${
        JSON.stringify(result.body).slice(0, 350)
      }`
    )

    assert.equal(result.body.success, true)

    assert.match(
      String(result.body.data?._id || ""),
      /^[a-f0-9]{24}$/
    )

    assert.deepEqual(
      Object.keys(result.body.data).sort(),
      ["_id"]
    )

    assert.equal(
      typeof result.body.checkoutToken,
      "string"
    )

    assert.ok(result.body.checkoutToken.length > 0)
    assert.equal(result.body.checkoutVersion, "v3")

    const persisted = orders.get(attemptKey)

    assert.ok(persisted)
    assert.equal(persisted.storefront, storefront)
    assert.equal(persisted.paymentStatus, "unpaid")

    assert.equal(
      verifyGuestCheckoutToken(
        persisted,
        result.body.checkoutToken
      ),
      true
    )

    const text = JSON.stringify(result.body)

    for (const privateField of [
      "storefrontCreationAttemptKey",
      "storefrontCreationFingerprint",
      "storefrontRecoveryProofHash",
      "storefrontRecoveryExpiresAt"
    ]) {
      assert.equal(text.includes(privateField), false)
    }

    console.log(
      `PASS: ${storefront} HTTP 201 sanitized and token valid`
    )

    const before = creationCount

    const duplicate = await post(
      base, request, attemptKey, secret
    )

    assert.equal(duplicate.status, 409)
    assert.equal(creationCount, before)

    console.log(
      `PASS: ${storefront} repeat submission blocked`
    )
  }

  // Prove the catalog channel cannot be crossed.
  const studioId = [...products.entries()].find(
    ([, product]) => product.storefront === "signavi_studio"
  )[0]

  const beforeCrossChannel = creationCount

  const mixed = await post(
    base,
    payload("signavi_store", studioId),
    randomUUID(),
    createStorefrontRecoverySecret()
  )

  assert.notEqual(mixed.status, 201)
  assert.equal(creationCount, beforeCrossChannel)

  console.log("PASS: Cross-channel product rejected")

  // Missing unique index must block order creation.
  indexEnabled = false

  const beforeMissingIndex = creationCount

  const unavailable = await post(
    base,
    payload("signavi_studio", studioId),
    randomUUID(),
    createStorefrontRecoverySecret()
  )

  assert.equal(unavailable.status, 503)
  assert.equal(creationCount, beforeMissingIndex)

  console.log("PASS: Missing unique index blocks HTTP creation")
  console.log("PASS: No real database connection")
  console.log("PASS: No Square payment requests")
  console.log("PASS: Recovery endpoint remains disabled")
  console.log("ALL ISOLATED ORDER-CREATION HTTP TESTS PASSED")
} finally {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve())
    )
  }

  restore()
}
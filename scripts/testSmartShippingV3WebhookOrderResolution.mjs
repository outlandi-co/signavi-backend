import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  parseV3WebhookOrderReference
} from "../utils/smartShippingV3WebhookReference.js"

const source = readFileSync(
  new URL("../routes/squareWebhook.js", import.meta.url),
  "utf8"
)

const start = source.indexOf(
  "const resolveOrder = async (squareOrder) => {"
)

const end = source.indexOf(
  "const sendReceiptOnce = async"
)

assert.ok(start >= 0 && end > start)

const functionSource = source.slice(start, end)

const createResolver = new Function(
  "Order",
  "Quote",
  "taggedId",
  "parseV3WebhookOrderReference",
  functionSource + "\nreturn resolveOrder"
)

const idA = "507f191e810c19729de860ea"
const idB = "507f191e810c19729de860eb"

const refA = createV3SquareSafeCheckoutReference({
  orderId: idA
})

const refB = createV3SquareSafeCheckoutReference({
  orderId: idB
})

const rows = {
  [idA]: { _id: idA, squareOrderId: "square-a" },
  [idB]: { _id: idB, squareOrderId: "square-b" }
}

let lookups = 0

const Order = {
  findOne: async ({ squareOrderId }) => {
    lookups++
    return Object.values(rows).find(
      row => row.squareOrderId === squareOrderId
    ) ?? null
  },
  findById: async id => {
    lookups++
    return rows[String(id)] ?? null
  }
}

const Quote = {
  findById: () => ({
    select: async () => null
  })
}

const taggedId = squareOrder =>
  /^[a-f0-9]{24}$/i.test(squareOrder.reference_id ?? "")
    ? squareOrder.reference_id
    : null

const resolveOrder = createResolver(
  Order,
  Quote,
  taggedId,
  parseV3WebhookOrderReference
)

assert.equal(
  (await resolveOrder({
    id: "square-a",
    reference_id: refA
  }))?._id,
  idA
)
console.log("MATCHING SQUARE ID AND V3 REFERENCE: PASS")

assert.equal(
  await resolveOrder({
    id: "square-a",
    reference_id: refB
  }),
  null
)
console.log("CONFLICTING V3 ORDER ID: REJECTED")

assert.equal(
  await resolveOrder({
    id: "square-a",
    reference_id: "signavi-v3-invalid"
  }),
  null
)
console.log("MALFORMED V3 REFERENCE: REJECTED")

assert.equal(
  (await resolveOrder({
    id: "square-unrecorded",
    reference_id: refB
  }))?._id,
  idB
)
console.log("CANONICAL V3 FALLBACK: PASS")

assert.equal(
  await resolveOrder({
    id: "square-unrecorded",
    reference_id: "not-a-reference"
  }),
  null
)
console.log("UNKNOWN REFERENCE: REJECTED")

assert.equal(
  (await resolveOrder({
    id: "square-unrecorded",
    reference_id: idA
  }))?._id,
  idA
)
console.log("LEGACY DIRECT ORDER LOOKUP: PRESERVED")

assert.ok(lookups >= 6)

console.log("ALL 6 RESOLVER SCENARIOS: PASS")
console.log("DATABASE LOOKUPS: MOCKED")
console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO SQUARE API REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO PAID-ORDER UPDATE")
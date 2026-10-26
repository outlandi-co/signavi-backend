import assert from "node:assert/strict"

import {
  verifyV3RecoveredLinkCandidate
} from "../utils/smartShippingV3RecoveredLinkVerification.js"

let squareCalls = 0

const client = {
  checkout: {
    paymentLinks: {
      get: async () => {
        squareCalls++
        throw new Error("Mock read-only Square lookup reached.")
      }
    }
  },
  orders: {
    get: async () => {
      squareCalls++
      throw new Error("Unexpected Square order lookup.")
    }
  }
}

const base = () => ({
  client,
  order: {
    _id: "507f191e810c19729de860ea",
    squareEnvironment: "sandbox",
    currency: "USD",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: ""
  },
  operation: {
    orderId: "507f191e810c19729de860ea",
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "synthetic-owner",
    squareCreationAttemptClaimedAt: new Date(),
    amountCents: 100,
    checkoutReferenceId: "synthetic-reference",
    idempotencyKey: "signavi-v3-sandbox-fixture",
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  },
  expectedPaymentLinkId: "synthetic-link",
  expectedLocationId: "synthetic-location"
})

const cases = [
  ["paid order", x => { x.order.paymentStatus = "paid" }],
  ["order mismatch", x => { x.order._id = "different-id" }],
  ["amount mismatch", x => { x.order.squareExpectedAmountCents = 200 }],
  ["missing claim", x => {
    x.operation.squareCreationAttemptClaimedAt = null
  }],
  ["missing owner", x => { x.operation.requestOwner = "" }],
  ["wrong operation state", x => {
    x.operation.status = "completed"
  }],
  ["existing Square link", x => {
    x.operation.squarePaymentLinkId = "existing-link"
  }],
  ["missing location", x => { x.expectedLocationId = "" }],
  ["wrong environment", x => {
    x.order.squareEnvironment = "production"
  }],
  ["missing idempotency", x => {
    x.operation.idempotencyKey = ""
  }],
  ["wrong idempotency prefix", x => {
    x.operation.idempotencyKey = "untrusted-fixture"
  }],
  ["missing reference", x => {
    x.operation.checkoutReferenceId = ""
  }],
  ["missing link candidate", x => {
    x.expectedPaymentLinkId = ""
  }]
]

for (const [name, modify] of cases) {
  const candidate = base()
  modify(candidate)

  await assert.rejects(
    verifyV3RecoveredLinkCandidate(candidate),
    /preverification rejected/,
    name
  )

  assert.equal(squareCalls, 0, name)
  console.log(`${name.toUpperCase()}: REJECTED WITHOUT LOOKUP`)
}

await assert.rejects(
  verifyV3RecoveredLinkCandidate(base()),
  /Mock read-only Square lookup reached/
)

assert.equal(squareCalls, 1)

console.log("VALID CANDIDATE REACHES READ-ONLY LOOKUP: PASS")
console.log("INVALID CANDIDATES MAKE NO SQUARE REQUESTS: PASS")
const makeSquareFixture = () => {
  const candidate = base()

  const calls = {
    linkGet: 0,
    orderGet: 0,
    create: 0
  }

  const paymentLink = {
    id: "synthetic-link",
    orderId: "synthetic-square-order",
    url: "https://sandbox.square.link/u/synthetic-fixture"
  }

  const squareOrder = {
    id: "synthetic-square-order",
    referenceId: "synthetic-reference",
    locationId: "synthetic-location",
    totalMoney: {
      amount: 100n,
      currency: "USD"
    }
  }

  candidate.client = {
    checkout: {
      paymentLinks: {
        get: async ({ id }) => {
          calls.linkGet++
          assert.equal(id, candidate.expectedPaymentLinkId)
          return { paymentLink }
        },
        create: async () => {
          calls.create++
          throw new Error("FORBIDDEN: Square creation attempted")
        }
      }
    },
    orders: {
      get: async ({ orderId }) => {
        calls.orderGet++
        assert.equal(orderId, paymentLink.orderId)
        return { order: squareOrder }
      }
    }
  }

  return {
    candidate,
    calls,
    paymentLink,
    squareOrder
  }
}

const positiveFixture = makeSquareFixture()
const positive = await verifyV3RecoveredLinkCandidate(
  positiveFixture.candidate
)

assert.equal(positive.eligibleForFurtherReview, true)
assert.equal(positive.databaseWriteAuthorized, false)
assert.equal(positive.squareCreationAuthorized, false)
assert.equal(positive.claimResetAuthorized, false)
assert.equal(positive.customerPaymentConfirmed, false)
assert.equal(positive.paymentLinkRecorded, false)

assert.equal(positive.verified.verified, true)
assert.equal(positive.verified.checkoutReferenceVerified, true)
assert.equal(positive.verified.locationVerified, true)
assert.equal(positive.verified.amountCents, 100)
assert.equal(
  positive.verified.squarePaymentLinkId,
  "synthetic-link"
)
assert.equal(
  positive.verified.squareOrderId,
  "synthetic-square-order"
)
assert.equal(positiveFixture.calls.linkGet, 1)
assert.equal(positiveFixture.calls.orderGet, 1)
assert.equal(positiveFixture.calls.create, 0)

console.log("POSITIVE SQUARE ASSOCIATION: PASS")
console.log("VERIFIED LINK DOES NOT CONFIRM PAYMENT: PASS")
console.log("VERIFICATION DOES NOT AUTHORIZE WRITES: PASS")

const associationFailures = [
  [
    "wrong Square link",
    f => { f.paymentLink.id = "other-link" },
    /payment-link lookup mismatch/,
    0
  ],
  [
    "wrong checkout reference",
    f => { f.squareOrder.referenceId = "other-reference" },
    /checkout reference mismatch/,
    1
  ],
  [
    "wrong amount",
    f => { f.squareOrder.totalMoney.amount = 200n },
    /amount or currency mismatch/,
    1
  ],
  [
    "wrong currency",
    f => { f.squareOrder.totalMoney.currency = "EUR" },
    /amount or currency mismatch/,
    1
  ],
  [
    "wrong location",
    f => { f.squareOrder.locationId = "other-location" },
    /order location mismatch/,
    1
  ],
  [
    "wrong Square order",
    f => { f.squareOrder.id = "other-order" },
    /order identity mismatch/,
    1
  ],
  [
    "untrusted Square URL",
    f => {
      f.paymentLink.url =
        "https://sandbox.square.link.attacker.test/u/fake"
    },
    /Untrusted Square checkout URL/,
    1
  ]
]

for (const [name, mutate, pattern, expectedOrderGets]
  of associationFailures) {
  const fixture = makeSquareFixture()
  mutate(fixture)

  await assert.rejects(
    verifyV3RecoveredLinkCandidate(fixture.candidate),
    pattern,
    name
  )

  assert.equal(fixture.calls.linkGet, 1, name)
  assert.equal(fixture.calls.orderGet, expectedOrderGets, name)
  assert.equal(fixture.calls.create, 0, name)

  console.log(`${name.toUpperCase()}: REJECTED`)
}

console.log("SQUARE ASSOCIATION REJECTION TESTS: PASS")
console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO REAL SQUARE API REQUESTS")
console.log("NO PAYMENT LINK CREATION")
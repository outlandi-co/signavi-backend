import assert from "node:assert/strict"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  createV3RecoveryTrustedRecordLoader
} from "../utils/smartShippingV3RecoveryTrustedRecordLoader.js"

import {
  createV3RecoverySandboxReader
} from "../utils/smartShippingV3RecoverySandboxReader.js"

import {
  inspectV3RecoveryReadOnly
} from "../utils/smartShippingV3RecoveryReadOnlyCoordinator.js"

process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

const orderId = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({ orderId })

const makeFixture = () => {
  const calls = {
    dbOrder: 0,
    dbOperation: 0,
    merchant: 0,
    location: 0,
    link: 0,
    squareOrder: 0,
    create: 0,
    writes: 0
  }

  const db = {
    readyState: 1,
    name: "signavi_shipping_v3_recovery_tests"
  }

  const order = {
    _id: orderId,
    squareEnvironment: "sandbox",
    currency: "USD",
    status: "payment_required",
    paymentStatus: "unpaid",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: ""
  }

  const operation = {
    orderId,
    environment: "sandbox",
    status: "reconciliation_required",
    requestOwner: "synthetic-owner",
    squareCreationAttemptClaimedAt: new Date(),
    idempotencyKey: "signavi-v3-sandbox-integration",
    checkoutReferenceId: reference,
    amountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  }

  const merchant = {
    id: "synthetic-merchant",
    status: "ACTIVE",
    currency: "USD"
  }

  const location = {
    id: "synthetic-location",
    merchantId: "synthetic-merchant",
    status: "ACTIVE",
    currency: "USD"
  }

  const link = {
    id: "synthetic-link",
    orderId: "synthetic-square-order",
    url: "https://sandbox.square.link/u/synthetic"
  }

  const squareOrder = {
    id: "synthetic-square-order",
    referenceId: reference,
    locationId: "synthetic-location",
    totalMoney: {
      amount: 100n,
      currency: "USD"
    }
  }

  const OrderModel = {
    findById: id => {
      calls.dbOrder++
      assert.equal(String(id), orderId)
      return { lean: async () => order }
    }
  }

  const PaymentOperationModel = {
    findOne: ({ orderId: id }) => {
      calls.dbOperation++
      assert.equal(String(id), orderId)
      return { lean: async () => operation }
    }
  }

  class FakeSquareClient {
    constructor({ token }) {
      assert.equal(token, "synthetic-token")

      this.merchants = {
        get: async ({ merchantId }) => {
          calls.merchant++
          assert.equal(merchantId, "synthetic-merchant")
          return { merchant }
        }
      }

      this.locations = {
        get: async ({ locationId }) => {
          calls.location++
          assert.equal(locationId, "synthetic-location")
          return { location }
        }
      }

      this.checkout = {
        paymentLinks: {
          get: async ({ id }) => {
            calls.link++
            assert.equal(id, "synthetic-link")
            return { paymentLink: link }
          },
          create: async () => {
            calls.create++
            throw new Error("FORBIDDEN: payment creation")
          }
        }
      }

      this.orders = {
        get: async ({ orderId: id }) => {
          calls.squareOrder++
          assert.equal(id, "synthetic-square-order")
          return { order: squareOrder }
        }
      }
    }
  }

  const loadTrustedRecords = createV3RecoveryTrustedRecordLoader({
    connection: db,
    OrderModel,
    PaymentOperationModel
  })

  const reader = createV3RecoverySandboxReader({
    token: "synthetic-token",
    expectedMerchantId: "synthetic-merchant",
    expectedLocationId: "synthetic-location",
    Client: FakeSquareClient
  })

  assert.equal(reader.createPaymentLink, undefined)
  assert.equal(reader.lookupClient.checkout.paymentLinks.create, undefined)

  const input = {
    orderId,
    expectedPaymentLinkId: "synthetic-link",
    loadTrustedRecords,
    verifyTrustedIdentity: reader.verifyIdentity,
    lookupClient: reader.lookupClient,
    expectedMerchantId: reader.merchantId,
    expectedLocationId: reader.locationId
  }

  return {
    calls,
    db,
    order,
    operation,
    merchant,
    location,
    link,
    squareOrder,
    input
  }
}

const success = makeFixture()
const result = await inspectV3RecoveryReadOnly(success.input)

assert.equal(result.eligibleForFurtherReview, true)
assert.equal(result.databaseWriteAuthorized, false)
assert.equal(result.squareCreationAuthorized, false)
assert.equal(result.claimResetAuthorized, false)
assert.equal(result.customerPaymentConfirmed, false)
assert.equal(result.paymentLinkRecorded, false)

assert.equal(result.verified.verified, true)
assert.equal(result.verified.checkoutReferenceVerified, true)
assert.equal(result.verified.locationVerified, true)
assert.equal(result.verified.amountCents, 100)
assert.equal(success.calls.dbOrder, 1)
assert.equal(success.calls.dbOperation, 1)
assert.equal(success.calls.merchant, 1)
assert.equal(success.calls.location, 1)
assert.equal(success.calls.link, 1)
assert.equal(success.calls.squareOrder, 1)
assert.equal(success.calls.create, 0)
assert.equal(success.calls.writes, 0)

console.log("FULL INTEGRATED READ-ONLY VERIFICATION: PASS")
console.log("CUSTOMER PAYMENT NOT CONFIRMED: PASS")
console.log("NO WRITE OR CREATION AUTHORIZATION: PASS")

const failures = [
  ["paid order", f => { f.order.paymentStatus = "paid" }, 0, 0],
  ["wrong reference", f => {
    f.operation.checkoutReferenceId = "wrong-reference"
  }, 0, 0],
  ["missing creation claim", f => {
    f.operation.squareCreationAttemptClaimedAt = null
  }, 1, 0],
  ["wrong merchant", f => {
    f.merchant.id = "different-merchant"
  }, 1, 0],
  ["wrong location", f => {
    f.location.id = "different-location"
  }, 1, 0],
  ["wrong amount", f => {
    f.squareOrder.totalMoney.amount = 200n
  }, 1, 1],
  ["wrong Square reference", f => {
    f.squareOrder.referenceId = "wrong-reference"
  }, 1, 1],
  ["wrong Square URL", f => {
    f.link.url = "https://evil.example/u/synthetic"
  }, 1, 1],
  ["invalid database", f => {
    f.db.name = "signavi_shipping_v3_dev"
  }, 0, 0]
]

for (const [name, mutate, expectedMerchantCalls, expectedLinks]
  of failures) {
  const f = makeFixture()
  mutate(f)

  await assert.rejects(
    inspectV3RecoveryReadOnly(f.input),
    name
  )

  assert.equal(f.calls.merchant, expectedMerchantCalls, name)
  assert.equal(f.calls.link, expectedLinks, name)
  assert.equal(f.calls.create, 0, name)
  assert.equal(f.calls.writes, 0, name)

  console.log(`${name.toUpperCase()}: REJECTED`)
}

console.log("NINE INTEGRATED FAILURE CASES: PASS")
console.log("NO ACTUAL MONGODB CONNECTION")
console.log("NO DATABASE WRITES")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT-LINK CREATION")
console.log("NO CLAIM RESET")
console.log("ORIGINAL ORDER NOT ACCESSED")
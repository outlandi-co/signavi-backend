import assert from "node:assert/strict"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  createV3RecoveryTrustedInspection
} from "../utils/smartShippingV3RecoveryTrustedInspection.js"

// All credentials are synthetic and exist only in this test process.
process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

process.env.SQUARE_SANDBOX_ACCESS_TOKEN = "synthetic-token"
process.env.SQUARE_SANDBOX_MERCHANT_ID = "synthetic-merchant"
process.env.SQUARE_SANDBOX_LOCATION_ID = "synthetic-location"

const orderId = "507f191e810c19729de860ea"
const reference = createV3SquareSafeCheckoutReference({ orderId })

const connection = {
  readyState: 1,
  name: "signavi_shipping_v3_recovery_tests",
  db: {
    databaseName: "signavi_shipping_v3_recovery_tests"
  }
}

const calls = {
  order: 0,
  operation: 0,
  merchant: 0,
  location: 0,
  link: 0,
  squareOrder: 0,
  create: 0
}

const OrderModel = {
  findById: id => {
    calls.order++
    assert.equal(String(id), orderId)

    return {
      lean: async () => ({
        _id: id,
        squareEnvironment: "sandbox",
        currency: "USD",
        status: "payment_required",
        paymentStatus: "unpaid",
        squareExpectedAmountCents: 100,
        squarePaymentLinkId: "",
        squareOrderId: ""
      })
    }
  }
}

const PaymentOperationModel = {
  findOne: ({ orderId: id }) => {
    calls.operation++

    return {
      lean: async () => ({
        orderId: id,
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
      })
    }
  }
}

class FakeSquareClient {
  constructor({ token }) {
    assert.equal(token, "synthetic-token")

    this.merchants = {
      get: async () => {
        calls.merchant++

        return {
          merchant: {
            id: "synthetic-merchant",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.locations = {
      get: async () => {
        calls.location++

        return {
          location: {
            id: "synthetic-location",
            merchantId: "synthetic-merchant",
            status: "ACTIVE",
            currency: "USD"
          }
        }
      }
    }

    this.checkout = {
      paymentLinks: {
        get: async () => {
          calls.link++

          return {
            paymentLink: {
              id: "synthetic-link",
              orderId: "synthetic-square-order",
              url: "https://sandbox.square.link/u/synthetic"
            }
          }
        }
      }
    }

    this.orders = {
      get: async () => {
        calls.squareOrder++

        return {
          order: {
            id: "synthetic-square-order",
            referenceId: reference,
            locationId: "synthetic-location",
            totalMoney: {
              amount: 100n,
              currency: "USD"
            }
          }
        }
      }
    }
  }
}

const options = {
  connection,
  OrderModel,
  PaymentOperationModel,
  Client: FakeSquareClient
}

const entry = createV3RecoveryTrustedInspection(options)

const result = await entry.inspect({
  orderId,
  expectedPaymentLinkId: "synthetic-link"
})

assert.equal(result.eligibleForFurtherReview, true)
assert.equal(result.databaseWriteAuthorized, false)
assert.equal(result.squareCreationAuthorized, false)
assert.equal(result.claimResetAuthorized, false)
assert.equal(result.customerPaymentConfirmed, false)

assert.equal(calls.order, 1)
assert.equal(calls.operation, 1)
assert.equal(calls.merchant, 1)
assert.equal(calls.location, 1)
assert.equal(calls.link, 1)
assert.equal(calls.squareOrder, 1)
assert.equal(calls.create, 0)

console.log("TRUSTED INSPECTION ENTRY POINT: PASS")

await assert.rejects(
  entry.inspect({
    orderId: "invalid",
    expectedPaymentLinkId: "synthetic-link"
  })
)

assert.equal(calls.order, 1)
console.log("INVALID ORDER REJECTED BEFORE RECORD ACCESS: PASS")

connection.name = "signavi_shipping_v3_dev"

await assert.rejects(
  entry.inspect({
    orderId,
    expectedPaymentLinkId: "synthetic-link"
  }),
  /boundary rejected/
)

console.log("DATABASE SWITCH REJECTED: PASS")
connection.name = "signavi_shipping_v3_recovery_tests"

process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED = "true"

await assert.rejects(
  entry.inspect({
    orderId,
    expectedPaymentLinkId: "synthetic-link"
  }),
  /boundary rejected/
)

console.log("PAYMENT CREATION FLAG REJECTED: PASS")
delete process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED

process.env.SQUARE_SANDBOX_LOCATION_ID = "changed-location"

await assert.rejects(
  entry.inspect({
    orderId,
    expectedPaymentLinkId: "synthetic-link"
  }),
  /configuration changed/
)

console.log("SERVER IDENTITY CHANGE REJECTED: PASS")
process.env.SQUARE_SANDBOX_LOCATION_ID = "synthetic-location"

process.env.NODE_ENV = "production"

assert.throws(
  () => createV3RecoveryTrustedInspection(options),
  /boundary rejected/
)

console.log("PRODUCTION MODE REJECTED: PASS")
assert.equal(calls.create, 0)

console.log("NO DATABASE CONNECTION OR WRITES")
console.log("NO REAL SQUARE REQUESTS")
console.log("NO PAYMENT CREATION")
console.log("NO CLAIM RESET")
console.log("LIVE RECOVERY STILL DISABLED")
import assert from "node:assert/strict"
import crypto from "node:crypto"
import mongoose from "mongoose"

import Order from "../models/Order.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"

import {
  coordinateV3RecoveryTestOnly
} from "../utils/smartShippingV3RecoveryTestCoordinator.js"

import {
  inspectV3RecoveryReadOnly
} from "../utils/smartShippingV3RecoveryReadOnlyCoordinator.js"

import {
  createV3RecoveryTrustedRecordLoader
} from "../utils/smartShippingV3RecoveryTrustedRecordLoader.js"
const dbName = "signavi_shipping_v3_recovery_tests"

const uri =
  `mongodb://127.0.0.1:27019/${dbName}?replicaSet=signaviV3Sandbox`

if (
  process.env.NODE_ENV !== "test" ||
  process.env.SQUARE_ENVIRONMENT !== "sandbox" ||
  process.env.SMART_SHIPPING_V3_RECOVERY_TEST_WRITES !== "true" ||
  process.env.SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED !== "false"
) {
  throw new Error("STOP: Synthetic recovery test gates rejected.")
}

const id = new mongoose.Types.ObjectId()
const orderId = String(id)
const owner = `synthetic-owner-${crypto.randomUUID()}`
const idempotencyKey = `signavi-v3-sandbox-${crypto.randomUUID()}`

const reference = createV3SquareSafeCheckoutReference({
  orderId
})

const expectedPaymentLinkId = `mock-link-${crypto.randomUUID()}`
const squareOrderId = `mock-square-order-${crypto.randomUUID()}`
const paymentUrl = "https://sandbox.square.link/u/synthetic-test"

const claimedAt = new Date(Date.now() - 120000)
const expiredAt = new Date(Date.now() - 60000)

const verified = Object.freeze({
  verified: true,
  checkoutReferenceVerified: true,
  amountCents: 100,
  squarePaymentLinkId: expectedPaymentLinkId,
  squareOrderId,
  paymentUrl
})

let connected = false
let insertedOrder = false
let insertedOperation = false
let insertedLock = false
let inspections = 0

try {
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
    retryWrites: false,
    autoIndex: false
  })

  connected = true

  assert.equal(mongoose.connection.db.databaseName, dbName)

  const hello = await mongoose.connection.db.admin().command({
    hello: 1
  })

  assert.equal(hello.setName, "signaviV3Sandbox")
  assert.equal(hello.isWritablePrimary, true)

  const locks = mongoose.connection.collection(
    "smart_shipping_v3_checkout_locks"
  )

  console.log("ISOLATED LOCAL REPLICA SET: PASS")

  await Order.collection.insertOne({
    _id: id,
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    squareEnvironment: "sandbox",
    squareExpectedAmountCents: 100,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  insertedOrder = true

  await PaymentOperation.collection.insertOne({
    orderId: id,
    amountCents: 100,
    environment: "sandbox",
    status: "reconciliation_required",
    checkoutReferenceId: reference,
    idempotencyKey,
    requestOwner: owner,
    squareCreationAttemptClaimedAt: claimedAt,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  insertedOperation = true

  await locks.insertOne({
    _id: id,
    owner,
    expiresAt: expiredAt,
    ownershipChecks: 0
  })

  insertedLock = true

  const expectedMerchantId = "mock-sandbox-merchant"
  const expectedLocationId = "mock-sandbox-location"

  const loadTrustedRecords =
    createV3RecoveryTrustedRecordLoader()

  let squareLinkLookups = 0
  let squareOrderLookups = 0

  // The mock exposes only read-only Square methods.
  const lookupClient = {
    checkout: {
      paymentLinks: {
        get: async ({ id: requestedId }) => {
          squareLinkLookups++

          assert.equal(requestedId, expectedPaymentLinkId)

          return {
            paymentLink: {
              id: expectedPaymentLinkId,
              orderId: squareOrderId,
              url: paymentUrl
            }
          }
        }
      }
    },
    orders: {
      get: async ({ orderId: requestedId }) => {
        squareOrderLookups++

        assert.equal(requestedId, squareOrderId)

        return {
          order: {
            id: squareOrderId,
            referenceId: reference,
            locationId: expectedLocationId,
            totalMoney: {
              amount: 100n,
              currency: "USD"
            }
          }
        }
      }
    }
  }

  const verifyTrustedIdentity = async () => ({
    verified: true,
    merchantId: expectedMerchantId,
    locationId: expectedLocationId,
    currency: "USD"
  })

  const inspectionArgs = {
    orderId,
    expectedPaymentLinkId,
    loadTrustedRecords,
    verifyTrustedIdentity,
    lookupClient,
    expectedMerchantId,
    expectedLocationId
  }

  // Exercise the real read-only inspector.
  // Merchant and Square responses are mocked.
  const inspect = async args => {
    inspections++

    return inspectV3RecoveryReadOnly(args)
  }
  // Negative verification tests must run before any recording.
  // All Square objects below are synthetic mock responses.
  const fakeClient = ({ link = {}, order = {} } = {}) => ({
    checkout: {
      paymentLinks: {
        get: async ({ id }) => ({
          paymentLink: {
            id,
            orderId: squareOrderId,
            url: paymentUrl,
            ...link
          }
        })
      }
    },
    orders: {
      get: async ({ orderId: requestedOrderId }) => ({
        order: {
          id: requestedOrderId,
          referenceId: reference,
          locationId: expectedLocationId,
          totalMoney: {
            amount: 100n,
            currency: "USD"
          },
          ...order
        }
      })
    }
  })

  const negativeCases = [
    {
      label: "WRONG MERCHANT",
      overrides: {
        verifyTrustedIdentity: async () => ({
          verified: true,
          merchantId: "wrong-merchant",
          locationId: expectedLocationId,
          currency: "USD"
        })
      }
    },
    {
      label: "WRONG LOCATION",
      overrides: {
        lookupClient: fakeClient({
          order: { locationId: "wrong-location" }
        })
      }
    },
    {
      label: "WRONG AMOUNT",
      overrides: {
        lookupClient: fakeClient({
          order: {
            totalMoney: { amount: 101n, currency: "USD" }
          }
        })
      }
    },
    {
      label: "WRONG CHECKOUT REFERENCE",
      overrides: {
        lookupClient: fakeClient({
          order: { referenceId: "wrong-reference" }
        })
      }
    },
    {
      label: "WRONG PAYMENT LINK ID",
      overrides: {
        lookupClient: fakeClient({
          link: { id: "wrong-link" }
        })
      }
    }
  ]

  for (const { label, overrides } of negativeCases) {
    await assert.rejects(
      coordinateV3RecoveryTestOnly({
        orderId,
        owner,
        expectedPaymentLinkId,
        inspectionArgs: {
          ...inspectionArgs,
          ...overrides
        },
        inspect
      }),
      Error
    )

    const unchanged = await PaymentOperation.collection.findOne({
      orderId: id
    })

    assert.equal(unchanged.status, "reconciliation_required")
    assert.equal(unchanged.squarePaymentLinkId, "")
    assert.equal(unchanged.squareOrderId, "")
    assert.equal(unchanged.paymentUrl, "")
    assert.equal(
      unchanged.squareCreationAttemptClaimedAt.getTime(),
      claimedAt.getTime()
    )

    console.log(`${label}: REJECTED WITHOUT RECORDING`)
  }

  console.log("NEGATIVE TRUSTED INSPECTION TESTS: PASS")
  // Test persisted changes AFTER read-only Square verification.
  // All mutations are confined to the synthetic recovery database.

  const staleStateCases = [
    {
      label: "STALE OPERATION STATUS",
      mutate: () => PaymentOperation.collection.updateOne(
        {
          orderId: id,
          status: "reconciliation_required"
        },
        {
          $set: { status: "completed" }
        }
      ),
      restore: () => PaymentOperation.collection.updateOne(
        {
          orderId: id,
          status: "completed"
        },
        {
          $set: { status: "reconciliation_required" }
        }
      )
    },
    {
      label: "MISSING DURABLE CREATION CLAIM",
      mutate: () => PaymentOperation.collection.updateOne(
        {
          orderId: id,
          squareCreationAttemptClaimedAt: claimedAt
        },
        {
          $unset: { squareCreationAttemptClaimedAt: "" }
        }
      ),
      restore: () => PaymentOperation.collection.updateOne(
        {
          orderId: id,
          squareCreationAttemptClaimedAt: { $exists: false }
        },
        {
          $set: { squareCreationAttemptClaimedAt: claimedAt }
        }
      )
    }
  ]

  for (const scenario of staleStateCases) {
    let verifiedBeforeMutation = false
    let changed = false

    const inspectThenMutate = async args => {
      const result = await inspect(args)

      assert.equal(result.verified.verified, true)
      assert.equal(result.verified.checkoutReferenceVerified, true)

      verifiedBeforeMutation = true

      const mutation = await scenario.mutate()
      assert.equal(mutation.modifiedCount, 1)
      changed = true

      return result
    }

    try {
      await assert.rejects(
        coordinateV3RecoveryTestOnly({
          orderId,
          owner,
          expectedPaymentLinkId,
          inspectionArgs,
          inspect: inspectThenMutate
        }),
        Error
      )

      assert.equal(verifiedBeforeMutation, true)

      const operationAfter =
        await PaymentOperation.collection.findOne({ orderId: id })

      const orderAfter =
        await Order.collection.findOne({ _id: id })

      const lockAfter = await mongoose.connection
        .collection("smart_shipping_v3_checkout_locks")
        .findOne({ _id: id })

      assert.equal(operationAfter.squarePaymentLinkId, "")
      assert.equal(operationAfter.squareOrderId, "")
      assert.equal(operationAfter.paymentUrl, "")
      assert.equal(orderAfter.paymentStatus, "unpaid")
      assert.equal(orderAfter.status, "payment_required")
      assert.equal(lockAfter.owner, owner)
      assert.equal(lockAfter.ownershipChecks, 0)

      console.log(`${scenario.label}: REJECTED WITHOUT RECORDING`)
    } finally {
      if (changed) {
        const restored = await scenario.restore()
        assert.equal(restored.modifiedCount, 1)
      }
    }

    const restoredOperation =
      await PaymentOperation.collection.findOne({ orderId: id })

    assert.equal(restoredOperation.status, "reconciliation_required")
    assert.equal(
      restoredOperation.squareCreationAttemptClaimedAt.getTime(),
      claimedAt.getTime()
    )
  }

  console.log("STALE STATE REGRESSION TESTS: PASS")
  // Verify normally, then change persisted ownership BEFORE recording.
  let verifiedBeforeMutation = false

  const staleOwnerInspect = async args => {
    const result = await inspect(args)

    assert.equal(result.verified.verified, true)
    assert.equal(result.verified.checkoutReferenceVerified, true)

    verifiedBeforeMutation = true

    const change = await PaymentOperation.collection.updateOne(
      {
        orderId: id,
        requestOwner: owner,
        status: "reconciliation_required"
      },
      {
        $set: {
          requestOwner: "synthetic-substituted-owner"
        }
      }
    )

    assert.equal(change.modifiedCount, 1)

    return result
  }

  try {
    await assert.rejects(
      coordinateV3RecoveryTestOnly({
        orderId,
        owner,
        expectedPaymentLinkId,
        inspectionArgs,
        inspect: staleOwnerInspect
      }),
      Error
    )

    assert.equal(verifiedBeforeMutation, true)

    const rejected = await PaymentOperation.collection.findOne({
      orderId: id
    })

    assert.equal(rejected.status, "reconciliation_required")
    assert.equal(rejected.squarePaymentLinkId, "")
    assert.equal(rejected.squareOrderId, "")
    assert.equal(rejected.paymentUrl, "")
    assert.equal(
      rejected.squareCreationAttemptClaimedAt.getTime(),
      claimedAt.getTime()
    )

    const unchangedOrder = await Order.collection.findOne({
      _id: id
    })

    assert.equal(unchangedOrder.paymentStatus, "unpaid")
    assert.equal(unchangedOrder.status, "payment_required")

    const unchangedLock = await mongoose.connection
      .collection("smart_shipping_v3_checkout_locks")
      .findOne({ _id: id })

    assert.equal(unchangedLock.owner, owner)
    assert.equal(unchangedLock.ownershipChecks, 0)

    console.log(
      "STALE OWNER AFTER VERIFICATION: REJECTED WITHOUT RECORDING"
    )
  } finally {
    // Restore only this isolated synthetic fixture.
    const restored = await PaymentOperation.collection.updateOne(
      {
        orderId: id,
        requestOwner: "synthetic-substituted-owner"
      },
      {
        $set: { requestOwner: owner }
      }
    )

    assert.equal(restored.modifiedCount, 1)
  }
  const result = await coordinateV3RecoveryTestOnly({
    orderId,
    owner,
    expectedPaymentLinkId,
    inspectionArgs,
    inspect
  })

  assert.equal(result.recorded, true)
  assert.equal(result.paymentLinkRecorded, true)
  assert.equal(result.customerPaymentConfirmed, false)
  assert.equal(inspections, 9)
  assert.equal(squareLinkLookups, 4)
  assert.equal(squareOrderLookups, 4)
  console.log("TRUSTED INSPECTION AND SQUARE LOOKUPS: PASS")

  console.log("COORDINATOR TO MONGODB RECORDING: PASS")

  const operation = await PaymentOperation.collection.findOne({
    orderId: id
  })

  assert.equal(operation.status, "completed")
  assert.equal(operation.squarePaymentLinkId, expectedPaymentLinkId)
  assert.equal(operation.squareOrderId, squareOrderId)
  assert.equal(operation.paymentUrl, paymentUrl)
  assert.equal(
    operation.squareCreationAttemptClaimedAt.getTime(),
    claimedAt.getTime()
  )

  console.log("VERIFIED LINK AND DURABLE CLAIM: PASS")

  const order = await Order.collection.findOne({ _id: id })

  assert.equal(order.paymentStatus, "unpaid")
  assert.equal(order.status, "payment_required")
  assert.equal(order.squarePaymentLinkId, "")
  assert.equal(order.squareOrderId, "")

  console.log("CUSTOMER REMAINS UNPAID: PASS")

  const lock = await locks.findOne({ _id: id })

  assert.equal(lock.owner, owner)
  assert.equal(lock.expiresAt.getTime(), expiredAt.getTime())
  assert.ok(lock.ownershipChecks >= 1)

  console.log("ORIGINAL SYNTHETIC LOCK OWNERSHIP PRESERVED: PASS")

  await assert.rejects(
    coordinateV3RecoveryTestOnly({
      orderId,
      owner,
      expectedPaymentLinkId,
      inspectionArgs,
      inspect
    })
  )

  const afterReplay =
    await PaymentOperation.collection.findOne({ orderId: id })

  assert.equal(afterReplay.status, "completed")
  assert.equal(
    afterReplay.squarePaymentLinkId,
    expectedPaymentLinkId
  )

  console.log("DUPLICATE RECORDING REJECTED: PASS")

  console.log("NO REAL SQUARE REQUESTS")
  console.log("NO PAYMENT CREATION")
  console.log("ALL SYNTHETIC RECOVERY INTEGRATION TESTS PASSED")

} finally {
  if (connected) {
    try {
      if (
        mongoose.connection.db.databaseName === dbName &&
        insertedOrder
      ) {
        const locks = mongoose.connection.collection(
          "smart_shipping_v3_checkout_locks"
        )

        if (insertedLock) {
          await locks.deleteOne({
            _id: id,
            owner
          })
        }

        if (insertedOperation) {
          await PaymentOperation.collection.deleteOne({
            orderId: id,
            idempotencyKey
          })
        }

        await Order.collection.deleteOne({ _id: id })

        console.log("SYNTHETIC FIXTURES CLEANED")
      }
    } finally {
      await mongoose.disconnect()
    }
  }
}
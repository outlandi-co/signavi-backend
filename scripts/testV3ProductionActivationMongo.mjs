import crypto from "node:crypto"
import { createGuestCheckoutToken } from "../utils/guestCheckoutToken.js"
import { createV3OrderFingerprint } from "../utils/smartShippingV3OrderFingerprint.js"
import { createV3SignedQuote } from "../utils/smartShippingV3QuoteSigning.js"
import test from "node:test"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Order from "../models/Order.js"
import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  persistV3ProductionCheckoutAtomic
} from "../utils/persistV3ProductionCheckoutAtomic.js"

// Isolated test only. No Atlas connection or Square calls.
process.env.NODE_ENV = "test"
process.env.SQUARE_ENVIRONMENT = "sandbox"

const ID = new mongoose.Types.ObjectId()
let replset

test.before(async () => {
  replset = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  await mongoose.connect(replset.getUri(), {
    dbName: "signavi_v3_atomic_persistence_test",
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_v3_atomic_persistence_test"
  )

  // Native insertion avoids unrelated Order creation
  // hooks. The actual Mongoose model is used for reads.
  await mongoose.connection.db.collection(
    Order.collection.name
  ).insertOne({
    _id: ID,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    currency: "usd",
    subtotal: 40,
    tax: 3.30,
    finalPrice: 43.30,
    squareEnvironment: null,
    squareExpectedAmountCents: null
  })

  await Promise.all([
    Reservation.init(),
    PaymentOperation.init()
  ])
})

test.after(async () => {
  await mongoose.disconnect()
  if (replset) await replset.stop()
})



import {
  createV3ProductionCheckoutActivationCoordinator
} from "../utils/coordinateV3ProductionCheckoutActivation.js"

async function signedFixture() {
  process.env.SHIPPING_QUOTE_SECRET =
    crypto.randomBytes(32).toString("hex")

  process.env.SHIPPING_V3_QUOTE_SECRET =
    crypto.randomBytes(48).toString("hex")

  const id = new mongoose.Types.ObjectId()

  await new Order({
    _id: id,
    source: "store",
    status: "payment_required",
    paymentStatus: "unpaid",
    customerName: "V3 Activation Test",
    v3FirstAttemptProvenanceVersion: "storefront-v3-origin-v1",
    v3FirstAttemptProvenanceIssuedAt: new Date(),
    email: "activation-test@example.com",
    address: {
      street: "123 Test Street",
      city: "Test City",
      state: "CA",
      zip: "90001",
      country: "US"
    },
    subtotal: 39.98,
    tax: 3.30,
    items: [{
      productId: new mongoose.Types.ObjectId(),
      quantity: 2,
      finalPrice: 19.99,
      variant: { color: "black", size: "L" }
    }]
  }).save()

  const order = await Order.findById(id)

  return {
    id,
    order,
    guestToken: createGuestCheckoutToken(order),
    signedQuote: createV3SignedQuote({
      cartFingerprint: createV3OrderFingerprint(order),
      shippingAmountCents: 1200,
      parcelRateIds: ["test_rate_1", "test_rate_2"],
      carrier: "USPS",
      serviceToken: "usps_ground_advantage"
    })
  }
}

const testOnlySharedFence = async ({ orderId, amountCents }) => ({
  reserved: true,
  orderId,
  amountCents,
  environment: "production",
  owner: "isolated-test-owner",
  idempotencyKey: `signavi-production-${orderId}`,
  squareRequestAuthorized: false,
  retryAuthorized: false
})
function coordinator(historyChecker, fenceChecker = testOnlySharedFence) {
  return createV3ProductionCheckoutActivationCoordinator({
    Order,
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    checkHistoricalPayment: historyChecker,
    acquireSharedFence: fenceChecker
  })
}

async function assertNoPaymentRecords(id) {
  assert.equal(
    await Reservation.countDocuments({ orderId: id }),
    0
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: id }),
    0
  )

  const order = await Order.findById(id).lean()

  assert.equal(order.paymentStatus, "unpaid")
  assert.equal(order.squareExpectedAmountCents, null)
}

test("Unverified history blocks valid signed checkout", async () => {
  const fixture = await signedFixture()
  let calls = 0

  const run = coordinator(async () => {
    calls++
    return {
      verified: false,
      noPriorPaymentActivity: false,
      reason: "EXTERNAL_PAYMENT_HISTORY_NOT_VERIFIED"
    }
  })

  const result = await run(fixture)

  assert.equal(calls, 1)
  assert.equal(result.ready, false)
  assert.equal(result.reason, "HISTORICAL_PAYMENT_NOT_CLEARED")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  await assertNoPaymentRecords(fixture.id)
})

test("History verification exception blocks valid checkout", async () => {
  const fixture = await signedFixture()
  let calls = 0

  const run = coordinator(async () => {
    calls++
    throw new Error("Test-only history service unavailable")
  })

  const result = await run(fixture)

  assert.equal(calls, 1)
  assert.equal(result.ready, false)
  assert.equal(result.reason, "HISTORICAL_PAYMENT_CHECK_UNCERTAIN")
  assert.equal(result.squareRequestAuthorized, false)

  await assertNoPaymentRecords(fixture.id)
})

test("Explicit test-only clearance permits atomic persistence", async () => {
  const fixture = await signedFixture()
  let calls = 0

  // TEST-ONLY authorization fixture.
  // This is not real external payment-history evidence.
  const run = coordinator(async () => {
    calls++
    return {
      verified: true,
      noPriorPaymentActivity: true
    }
  })

  const result = await run(fixture)

  assert.equal(calls, 1)
  assert.equal(result.ready, true)
  assert.equal(result.persistedAndVerified, true)
  assert.equal(result.amountCents, 5528)
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  const stored = await Order.findById(fixture.id).lean()

  assert.equal(stored.finalPrice, 55.28)
  assert.equal(stored.squareExpectedAmountCents, 5528)

  assert.equal(
    await Reservation.countDocuments({ orderId: fixture.id }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: fixture.id }),
    1
  )

  // Reusing the same credentials cannot initialize again.
  const duplicate = await run(fixture)

  assert.equal(duplicate.ready, false)
  assert.equal(duplicate.squareRequestAuthorized, false)

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: fixture.id }),
    1
  )
})

test("Concurrent activation creates one payment identity", async () => {
  const fixture = await signedFixture()

  // Simulated clearance for transaction-concurrency testing only.
  const run = coordinator(async () => ({
    verified: true,
    noPriorPaymentActivity: true
  }))

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => run(fixture))
  )

  assert.equal(
    attempts.filter(x => x.ready === true).length,
    1
  )

  assert.ok(
    attempts.every(x => x.squareRequestAuthorized === false)
  )

  assert.ok(
    attempts.every(x => x.retryAuthorized === false)
  )

  assert.equal(
    await Reservation.countDocuments({ orderId: fixture.id }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: fixture.id }),
    1
  )
})

test("Shared fence rejection blocks signed checkout", async () => {
  const fixture = await signedFixture()
  let fenceCalls = 0

  const run = coordinator(
    async () => ({
      verified: true,
      noPriorPaymentActivity: true
    }),
    async () => {
      fenceCalls++
      return {
        reserved: false,
        reason: "EXISTING_SHARED_RESERVATION"
      }
    }
  )

  const result = await run(fixture)

  assert.equal(fenceCalls, 1)
  assert.equal(result.ready, false)
  assert.equal(result.reason, "SHARED_FENCE_NOT_VERIFIED")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  await assertNoPaymentRecords(fixture.id)
})

test("Uncertain shared fence cannot initialize payment", async () => {
  const fixture = await signedFixture()
  let fenceCalls = 0

  const run = coordinator(
    async () => ({
      verified: true,
      noPriorPaymentActivity: true
    }),
    async () => {
      fenceCalls++
      throw new Error("Test-only reservation timeout")
    }
  )

  const result = await run(fixture)

  assert.equal(fenceCalls, 1)
  assert.equal(result.ready, false)
  assert.equal(result.reason, "SHARED_FENCE_OUTCOME_UNCERTAIN")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  await assertNoPaymentRecords(fixture.id)
})

test("Malformed shared fence cannot initialize payment", async () => {
  const fixture = await signedFixture()
  let fenceCalls = 0

  const run = coordinator(
    async () => ({
      verified: true,
      noPriorPaymentActivity: true
    }),
    async ({ orderId, amountCents }) => {
      fenceCalls++

      return {
        reserved: true,
        orderId,
        amountCents,
        environment: "production",
        owner: "wrong-identity-test",
        idempotencyKey: "invalid-idempotency-key"
      }
    }
  )

  const result = await run(fixture)

  assert.equal(fenceCalls, 1)
  assert.equal(result.ready, false)
  assert.equal(result.reason, "SHARED_FENCE_NOT_VERIFIED")
  assert.equal(result.squareRequestAuthorized, false)
  assert.equal(result.retryAuthorized, false)

  await assertNoPaymentRecords(fixture.id)
})

test("missing first-attempt provenance blocks before history and reservation", async () => {
  const fixture = await signedFixture();
  const withoutProvenance = fixture.order.toObject();

  delete withoutProvenance.v3FirstAttemptProvenanceVersion;
  delete withoutProvenance.v3FirstAttemptProvenanceIssuedAt;

  let historyCalls = 0;
  let fenceCalls = 0;

  const run = coordinator(
    async () => {
      historyCalls++;
      throw new Error("History must not be queried");
    },
    async () => {
      fenceCalls++;
      throw new Error("Fence must not be acquired");
    }
  );

  const result = await run({
    order: withoutProvenance,
    guestToken: fixture.guestToken,
    signedQuote: fixture.signedQuote
  });

  assert.equal(result.ready, false);
  assert.equal(result.reason, "FIRST_ATTEMPT_NOT_ELIGIBLE");
  assert.equal(result.squareRequestAuthorized, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(historyCalls, 0);
  assert.equal(fenceCalls, 0);

  await assertNoPaymentRecords(fixture.id);
});

import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import { createV3TrustedCheckoutService } from "../utils/createV3TrustedCheckoutService.js"

let replica

async function seed(amountCents = 2500) {
  const id = String(new mongoose.Types.ObjectId())
  const purchaseKey = `signavi-v3-production-purchase-${id}`

  await Reservation.create({
    environment: "production",
    orderId: id,
    purchaseKey,
    idempotencyKey: purchaseKey,
    claimedByDocumentType: "order",
    claimedByDocumentId: id,
    status: "reserved",
    attemptClaimedAt: null
  })

  await PaymentOperation.create({
    environment: "production",
    orderId: id,
    idempotencyKey: purchaseKey,
    amountCents,
    status: "pending",
    squareCreationAttemptClaimedAt: null,
    requestOwner: "",
    squareIdempotencyKey: null,
    squarePaymentLinkId: "",
    squareOrderId: "",
    paymentUrl: ""
  })

  return { id, amountCents }
}

function makeService(create) {
  return createV3TrustedCheckoutService({
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    checkoutClient: {
      paymentLinks: {
        create
      }
    },
    locationId: "TEST_LOCATION"
  })
}

function run(service, purchase) {
  return service({
    orderId: purchase.id,
    amountCents: purchase.amountCents,
    redirectUrl: `https://signavi.store/success/${purchase.id}`
  })
}

async function getPair(id) {
  return Promise.all([
    Reservation.findOne({ orderId: id }).lean(),
    PaymentOperation.findOne({ orderId: id }).lean()
  ])
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_checkout_service_test",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  console.log("PASS: Isolated MongoDB replica set connected")

  // A. Successful checkout with persisted Square evidence.
  const normal = await seed()
  let normalCalls = 0

  const successService = makeService(async (request, options) => {
    normalCalls++
    assert.equal(options.maxRetries, 0)
    assert.match(request.idempotencyKey, /^sv3p-[a-f0-9]{40}$/)

    return {
      paymentLink: {
        id: "FAKE_SERVICE_LINK_354",
        orderId: "FAKE_SERVICE_ORDER_354",
        url: "https://square.link/u/fake354"
      }
    }
  })

  const success = await run(successService, normal)

  assert.equal(
    success.status,
    "link_recorded",
    `Success scenario: ${success.reason}`
  )
  assert.equal(normalCalls, 1)

  const [normalReservation, normalOperation] =
    await getPair(normal.id)

  assert.equal(normalReservation.status, "claim_pending")
  assert.equal(normalOperation.status, "reconciliation_required")
  assert.equal(
    normalOperation.squarePaymentLinkId,
    "FAKE_SERVICE_LINK_354"
  )
  assert.match(
    normalOperation.requestOwner,
    /^checkout:[0-9a-f-]{36}$/
  )

  console.log("PASS: Service generated trusted owner")
  console.log("PASS: One fake Square link recorded durably")

  const duplicate = await run(successService, normal)

  assert.equal(duplicate.status, "blocked")
  assert.equal(normalCalls, 1)

  console.log("PASS: Repeated request blocked without Square")

  // B. Ambiguous Square result must preserve reconciliation hold.
  const timeoutPurchase = await seed()
  let timeoutCalls = 0

  const timeoutService = makeService(async () => {
    timeoutCalls++
    throw new Error("SIMULATED_SQUARE_TIMEOUT")
  })

  const timeoutResult = await run(timeoutService, timeoutPurchase)

  assert.equal(timeoutResult.status, "reconciliation_required")
  assert.equal(timeoutResult.retryAuthorized, false)
  assert.equal(timeoutCalls, 1)

  const [timeoutReservation, timeoutOperation] =
    await getPair(timeoutPurchase.id)

  assert.equal(timeoutReservation.status, "claim_pending")
  assert.equal(
    timeoutOperation.status,
    "reconciliation_required"
  )
  assert.equal(timeoutOperation.squarePaymentLinkId, "")
  assert.ok(timeoutReservation.attemptClaimedAt)
  assert.ok(timeoutOperation.squareCreationAttemptClaimedAt)

  console.log("PASS: Timeout retains durable reconciliation hold")

  const timeoutReplay = await run(
    timeoutService,
    timeoutPurchase
  )

  assert.equal(timeoutReplay.status, "blocked")
  assert.equal(timeoutCalls, 1)

  console.log("PASS: Timeout replay cannot call Square again")

  // C. Multiple requests competing for the same order.
  const concurrent = await seed()
  let concurrentCalls = 0

  const concurrentService = makeService(async () => {
    concurrentCalls++

    return {
      paymentLink: {
        id: "FAKE_SERVICE_RACE_354",
        orderId: "FAKE_SERVICE_RACE_ORDER_354",
        url: "https://square.link/u/fakerace354"
      }
    }
  })

  const concurrentResults = await Promise.all(
    Array.from({ length: 12 }, () =>
      run(concurrentService, concurrent)
    )
  )

  assert.equal(
    concurrentResults.filter(
      result => result.status === "link_recorded"
    ).length,
    1
  )
  assert.equal(concurrentCalls, 1)

  const [raceReservation, raceOperation] =
    await getPair(concurrent.id)

  assert.equal(raceReservation.status, "claim_pending")
  assert.equal(
    raceOperation.squarePaymentLinkId,
    "FAKE_SERVICE_RACE_354"
  )

  assert.equal(
    await PaymentOperation.countDocuments({
      orderId: concurrent.id
    }),
    1
  )

  console.log("PASS: 12 concurrent attempts, 1 fake Square call")
  console.log("PASS: One durable purchase operation")

  console.log("===== STEP 354 SERVICE INTEGRATION PASSED =====")
  console.log("FAKE SQUARE ONLY")
  console.log("ISOLATED MONGODB ONLY")
  console.log("NO LIVE PAYMENT REQUESTS")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}
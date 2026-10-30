import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

import Reservation from "../models/SmartShippingV3ProductionPurchaseReservation.js"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"

import {
  initializeV3ProductionCheckoutAtomic
} from "../utils/initializeV3ProductionCheckoutAtomic.js"

import {
  createV3TrustedCheckoutService
} from "../utils/createV3TrustedCheckoutService.js"

let replica

const newId = () => String(new mongoose.Types.ObjectId())

async function prepare(id, amountCents) {
  return initializeV3ProductionCheckoutAtomic({
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    orderId: id,
    amountCents
  })
}

function createService(squareCreate) {
  return createV3TrustedCheckoutService({
    Reservation,
    PaymentOperation,
    startSession: () => mongoose.startSession(),
    locationId: "TEST_LOCATION",
    checkoutClient: {
      paymentLinks: {
        create: squareCreate
      }
    }
  })
}

async function execute(service, id, amountCents) {
  return service({
    orderId: id,
    amountCents,
    redirectUrl: `https://signavi.store/success/${id}`
  })
}

try {
  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  await mongoose.connect(replica.getUri(), {
    dbName: "signavi_v3_prepared_checkout_isolated",
    serverSelectionTimeoutMS: 10000
  })

  await Reservation.init()
  await PaymentOperation.init()

  console.log("PASS: Isolated MongoDB ready")

  const id = newId()
  const amountCents = 2750

  const firstPreparation = await prepare(id, amountCents)

  assert.equal(firstPreparation.prepared, true)
  assert.equal(firstPreparation.existed, false)

  console.log("PASS: Checkout initialized atomically")

  const secondPreparation = await prepare(id, amountCents)

  assert.equal(secondPreparation.prepared, true)
  assert.equal(secondPreparation.existed, true)

  console.log("PASS: Duplicate preparation reuses identity")

  let squareCalls = 0

  const service = createService(async (request, options) => {
    squareCalls++

    assert.equal(options.maxRetries, 0)
    assert.match(request.idempotencyKey, /^sv3p-[a-f0-9]{40}$/)

    return {
      paymentLink: {
        id: "FAKE_PREPARED_LINK_360",
        orderId: "FAKE_PREPARED_ORDER_360",
        url: "https://square.link/u/fake360"
      }
    }
  })

  const checkout = await execute(service, id, amountCents)

  assert.equal(
    checkout.status,
    "link_recorded",
    `Trusted checkout rejected: ${checkout.reason}`
  )

  assert.equal(squareCalls, 1)

  console.log("PASS: Prepared checkout produced one fake Square link")

  const reservation = await Reservation.findOne({
    orderId: id
  }).lean()

  const operation = await PaymentOperation.findOne({
    orderId: id
  }).lean()

  assert.equal(reservation.status, "claim_pending")
  assert.equal(operation.status, "reconciliation_required")
  assert.equal(
    operation.squarePaymentLinkId,
    "FAKE_PREPARED_LINK_360"
  )

  assert.equal(
    operation.squareOrderId,
    "FAKE_PREPARED_ORDER_360"
  )

  assert.match(operation.requestOwner, /^checkout:/)

  console.log("PASS: Owner and Square evidence recorded durably")

  const preparationAfterClaim = await prepare(id, amountCents)

  assert.equal(preparationAfterClaim.prepared, false)

  const checkoutReplay = await execute(service, id, amountCents)

  assert.equal(checkoutReplay.status, "blocked")
  assert.equal(squareCalls, 1)

  assert.equal(
    await Reservation.countDocuments({ orderId: id }),
    1
  )

  assert.equal(
    await PaymentOperation.countDocuments({ orderId: id }),
    1
  )

  console.log("PASS: Claimed checkout cannot be reinitialized")
  console.log("PASS: Checkout replay cannot invoke Square again")

  const invalidId = newId()
  const invalidPreparation = await prepare(invalidId, -100)

  assert.equal(invalidPreparation.prepared, false)

  assert.equal(
    await Reservation.countDocuments({ orderId: invalidId }),
    0
  )

  console.log("PASS: Invalid amount blocked before database creation")

  console.log("===== STEP 360 TRUSTED HANDOFF PASSED =====")
  console.log("FAKE SQUARE ONLY")
  console.log("ISOLATED MONGODB ONLY")

} finally {
  await mongoose.disconnect()
  if (replica) await replica.stop()
}
import "dotenv/config"
import assert from "node:assert/strict"
import mongoose from "mongoose"
import PaymentOperation from "../models/SmartShippingV3PaymentOperation.js"
import {
  claimV3SquareCreationAttempt
} from "../utils/smartShippingV3ClaimCreationAttempt.js"
import {
  createV3SquareSafeCheckoutReference
} from "../utils/smartShippingV3CheckoutReference.js"
import {
  coordinateV3PaymentPreparation
} from "../utils/smartShippingV3PaymentCoordinator.js"
import {
  markV3PaymentRequestStarted,
  markV3PaymentCompleted
} from "../utils/smartShippingV3PaymentState.js"
import {
  inspectV3PaymentReconciliation
} from "../utils/smartShippingV3Reconciliation.js"

const dbName = "signavi_shipping_v3_dev"
const orderId = new mongoose.Types.ObjectId()
const locksName = "smart_shipping_v3_checkout_locks"

let connected = false

try {
  assert.ok(process.env.MONGO_URI, "MONGO_URI missing.")

  await mongoose.connect(process.env.MONGO_URI, {
    dbName,
    serverSelectionTimeoutMS: 10000
  })

  connected = true
  assert.equal(mongoose.connection.name, dbName)
  await PaymentOperation.init()

  console.log("ISOLATED V3 DATABASE: PASS")

  const missing = await inspectV3PaymentReconciliation({
    orderId
  })

  assert.equal(missing.classification, "not_found")
  assert.equal(missing.requiresSquareLookup, false)

  console.log("MISSING OPERATION: PASS")

  const prepared = await coordinateV3PaymentPreparation({
    orderId,
    amountCents: 5528
  })

  assert.equal(prepared.success, true)

  // Supply the modern preclaim reference in this legacy test fixture.
  // This is test-only persistence, not Square authorization.
  const reference = createV3SquareSafeCheckoutReference({
    orderId: String(orderId)
  })

  assert.match(
    prepared.operation.idempotencyKey,
    /^signavi-v3-sandbox-/
  )

  const existingReference =
    prepared.operation.checkoutReferenceId || ""

  assert.ok(
    existingReference === "" || existingReference === reference,
    "Unexpected prepared checkout reference"
  )

  if (existingReference === "") {
    const referenceUpdate = await PaymentOperation.collection.updateOne(
      {
        orderId,
        status: "pending",
        checkoutReferenceId: ""
      },
      {
        $set: { checkoutReferenceId: reference }
      }
    )

    assert.equal(referenceUpdate.matchedCount, 1)
  }

  const args = {
    orderId,
    owner: prepared.lock.owner,
    amountCents: 5528,
    idempotencyKey: prepared.operation.idempotencyKey
  }

  const pending = await inspectV3PaymentReconciliation({
    orderId
  })

  assert.equal(pending.classification, "prepared_not_started")
  assert.equal(pending.requiresSquareLookup, false)
  assert.equal(pending.amountCents, 5528)
  assert.equal(pending.lockPresent, true)

  console.log("PREPARED OPERATION CLASSIFICATION: PASS")

  const started = await markV3PaymentRequestStarted(args)

  assert.equal(started.status, "reconciliation_required")

  const uncertain = await inspectV3PaymentReconciliation({
    orderId
  })

  assert.equal(uncertain.classification, "square_lookup_required")
  assert.equal(uncertain.requiresSquareLookup, true)
  assert.equal(uncertain.lockOwnerMatchesRequest, true)
  assert.equal(uncertain.idempotencyKey, args.idempotencyKey)

  console.log("INTERRUPTED SQUARE REQUEST: PASS")
  console.log("UNCERTAIN OPERATION REQUIRES LOOKUP: PASS")

  // Completion must fail before a durable creation-attempt claim.
  await assert.rejects(
    markV3PaymentCompleted({
      ...args,
      paymentUrl: "https://sandbox.square.test/payment",
      squarePaymentLinkId: "test-reconciliation-link",
      squareOrderId: "test-reconciliation-order"
    }),
    /rejected/
  )

  const preclaimOperation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.equal(preclaimOperation.status, "reconciliation_required")
  assert.equal(
    preclaimOperation.squareCreationAttemptClaimedAt ?? null,
    null
  )

  console.log("UNCLAIMED COMPLETION: BLOCKED")

  // Persist the one-time claim using the existing production helper.
  // The claim does not authorize a Square call.
  const claim = await claimV3SquareCreationAttempt({
    orderId,
    owner: args.owner,
    idempotencyKey: args.idempotencyKey
  })

  assert.equal(claim.claimed, true)
  assert.equal(claim.squareRequestAuthorized, false)
  assert.equal(claim.paymentCreated, false)

  const claimedOperation = await PaymentOperation.findOne({
    orderId
  }).lean()

  assert.ok(
    claimedOperation.squareCreationAttemptClaimedAt instanceof Date
  )

  console.log("DURABLE CREATION CLAIM: PASS")
  console.log("SQUARE CREATION AUTHORIZATION: FALSE")

  // These identifiers are simulated only.
  // This test checks the legacy transition and read-only classification,
  // not provider verification or permission to create a Square link.
  await markV3PaymentCompleted({
    ...args,
    paymentUrl: "https://sandbox.square.test/payment",
    squarePaymentLinkId: "test-reconciliation-link",
    squareOrderId: "test-reconciliation-order"
  })

  const completed = await inspectV3PaymentReconciliation({
    orderId
  })

  assert.equal(completed.classification, "payment_link_recorded")
  assert.equal(completed.requiresSquareLookup, false)

  console.log("RECORDED PAYMENT LINK: PASS")

  // Deliberately simulate an inconsistent local record.
  // This deletes only the temporary test lock.
  const removed = await mongoose.connection
    .collection(locksName)
    .deleteOne({ _id: orderId })

  assert.equal(removed.deletedCount, 1)

  const inconsistent = await inspectV3PaymentReconciliation({
    orderId
  })

  assert.equal(
    inconsistent.classification,
    "manual_review_inconsistent_records"
  )

  assert.equal(inconsistent.lockPresent, false)

  console.log("MISSING LOCK REQUIRES MANUAL REVIEW: PASS")

  const saved = await PaymentOperation.findOne({ orderId })

  assert.equal(saved.status, "completed")
  assert.equal(saved.amountCents, 5528)
  assert.equal(saved.idempotencyKey, args.idempotencyKey)

  console.log("INSPECTION DID NOT CHANGE PAYMENT RECORD: PASS")
  console.log("ALL V3 RECONCILIATION INSPECTION TESTS PASSED")

} catch (error) {
  console.error("V3 RECONCILIATION TEST FAILED:", error)
  process.exitCode = 1

} finally {
  if (
    connected &&
    mongoose.connection.readyState === 1 &&
    mongoose.connection.name === dbName
  ) {
    try {
      await PaymentOperation.deleteMany({ orderId })

      await mongoose.connection
        .collection(locksName)
        .deleteOne({ _id: orderId })

      console.log("CLEANUP: Temporary V3 records removed")
    } catch (error) {
      console.error("CLEANUP FAILED:", error.message)
      process.exitCode = 1
    }
  }

  await mongoose.disconnect()
}
import assert from "node:assert/strict"
import mongoose from "mongoose"
import { MongoMemoryServer } from "mongodb-memory-server"

process.env.NODE_ENV = "test"

const mongo = await MongoMemoryServer.create()

try {
  await mongoose.connect(
    mongo.getUri("signavi_reservation_isolated_test")
  )

  const { default: PaymentOperation } = await import(
    "../models/SmartShippingV3PaymentOperation.js"
  )

  const { default: DocumentReservation } = await import(
    "../models/SharedSquarePaymentReservation.js"
  )

  const { default: PurchaseReservation } = await import(
    "../models/SharedSquarePurchaseReservation.js"
  )

  const { loadInvoiceOrderPaymentEvidence: load } = await import(
    "../utils/loadInvoiceOrderPaymentEvidence.js"
  )

  const { validateInvoiceOrderPaymentEvidence: validate } =
    await import("../utils/validateInvoiceOrderPaymentEvidence.js")

  await Promise.all([
    PaymentOperation.init(),
    DocumentReservation.init(),
    PurchaseReservation.init()
  ])

  const cases = [
    "paymentOperations",
    "orderReservations",
    "invoiceReservations",
    "purchaseReservations"
  ]

  let counter = 0

  for (const conflict of cases) {
    counter += 1

    const orderId = new mongoose.Types.ObjectId()
    const invoiceId = new mongoose.Types.ObjectId()

    const scope = {
      invoiceId,
      orderId,
      environment: "sandbox"
    }

    const clean = await load(scope)

    assert.ok(
      Object.values(clean).every(
        records => Array.isArray(records) && records.length === 0
      )
    )

    const invoice = {
      _id: invoiceId,
      status: "draft",
      paymentStatus: "unpaid",
      finalProof: { approved: false }
    }

    const order = {
      _id: orderId,
      paymentStatus: "unpaid"
    }

    assert.equal(
      validate({ invoice, order, ...clean }).eligible,
      true
    )

    if (conflict === "paymentOperations") {
      await PaymentOperation.create({
        orderId,
        idempotencyKey: `test-operation-${counter}`,
        amountCents: 15000,
        environment: "sandbox"
      })
    }

    if (
      conflict === "orderReservations" ||
      conflict === "invoiceReservations"
    ) {
      const isOrder = conflict === "orderReservations"

      await DocumentReservation.create({
        documentType: isOrder ? "order" : "invoice",
        documentId: isOrder ? orderId : invoiceId,
        environment: "sandbox",
        amountCents: 15000,
        owner: `test-owner-${counter}`,
        idempotencyKey: `test-document-${counter}`
      })
    }

    if (conflict === "purchaseReservations") {
      await PurchaseReservation.create({
        environment: "sandbox",
        purchaseKey: `order:${orderId}`,
        claimedByDocumentType: "order",
        claimedByDocumentId: orderId
      })
    }

    const evidence = await load(scope)

    assert.equal(evidence[conflict].length, 1)

    const result = validate({
      invoice,
      order,
      ...evidence
    })

    assert.equal(result.eligible, false)
    assert.equal(result.squareRequestAuthorized, false)

    console.log(`${conflict}: FOUND AND BLOCKED`)
  }

  await assert.rejects(
    load({
      invoiceId: "invalid",
      orderId: new mongoose.Types.ObjectId(),
      environment: "sandbox"
    })
  )

  console.log("INVALID IDENTITY: REJECTED")
  console.log("DATABASE EVIDENCE: VERIFIED")
  console.log("SQUARE AUTHORIZATION: DISABLED")
  console.log("PAYMENT EVIDENCE LOADER TEST PASSED")
} finally {
  await mongoose.disconnect()
  await mongo.stop()
}
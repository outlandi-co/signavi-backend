import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import express from "express"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import sgMail from "@sendgrid/mail"
import { MongoMemoryReplSet } from "mongodb-memory-server"

// Force every imported application module into isolated test mode.
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "LOCAL_ONLY_INVOICE_EMAIL_SAFETY_TEST",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_ACCESS_TOKEN: "DUMMY_NOT_REAL",
  SQUARE_SANDBOX_ACCESS_TOKEN: "",
  SQUARE_PRODUCTION_ACCESS_TOKEN: "",
  SQUARE_LOCATION_ID: "DUMMY_LOCATION",
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false",
  SENDGRID_API_KEY: ""
})

delete process.env.MONGO_URI

const sha256 = value =>
  crypto.createHash("sha256").update(value).digest("hex")

let replica
let server
let tempDir
let originalSend
let sendStubInstalled = false

try {
  tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "signavi-invoice-email-test-")
  )

  process.env.UPLOAD_DIR = tempDir

  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  const uri = replica.getUri()
  const parsed = new URL(uri)

  assert.equal(parsed.protocol, "mongodb:")
  assert.ok(["127.0.0.1", "localhost"].includes(parsed.hostname))

  await mongoose.connect(uri, {
    dbName: "signavi_invoice_email_safety_test",
    serverSelectionTimeoutMS: 10000
  })

  const { default: Invoice } =
    await import("../models/Invoice.js")

  const { default: AdminEmail } =
    await import("../models/AdminEmail.js")

  const { default: invoiceRoutes } =
    await import("../routes/invoiceRoutes.js")

  const { PROOF_TERMS_VERSION } =
    await import("../controllers/invoiceController.js")

  // Application modules were loaded without a provider API key.
  // Replace delivery with a forbidden-operation stub.
  let attemptedSends = 0

  originalSend = sgMail.send

  sgMail.send = async () => {
    attemptedSends++
    throw new Error("FORBIDDEN: SendGrid delivery attempted")
  }

  sendStubInstalled = true

  // Satisfy the controller's configuration check only.
  // This value is never given to the SendGrid client.
  process.env.SENDGRID_API_KEY = "LOCAL_TEST_ONLY_NOT_REAL"

  const invoice = await Invoice.create({
    customerName: "Invoice Email Safety Test",
    customerEmail: "invoice-test@example.invalid",
    status: "proof_uploaded",
    paymentStatus: "unpaid",
    items: [{
      name: "Test Product",
      quantity: 1,
      price: 25
    }],
    finalProof: {
      files: [{
        url: "https://example.invalid/proof.png",
        fileName: "proof.png",
        mimeType: "image/png"
      }]
    }
  })

  const fingerprint = sha256(JSON.stringify({
    invoiceId: String(invoice._id),
    files: invoice.finalProof.files.map(file => ({
      url: String(file.url || ""),
      fileName: String(file.fileName || ""),
      mimeType: String(file.mimeType || "")
    })),
    items: invoice.items.map(({ name, quantity, price }) => ({
      name,
      quantity,
      price
    })),
    notes: invoice.notes || "",
    shipping: invoice.shipping || 0,
    total: invoice.total || 0
  }))

  invoice.finalProof.approved = true
  invoice.finalProof.approvedAt = new Date()
  invoice.finalProof.termsAccepted = true
  invoice.finalProof.termsAcceptedAt = new Date()
  invoice.finalProof.termsVersion = PROOF_TERMS_VERSION
  invoice.finalProof.termsText = "Test approval"
  invoice.finalProof.approvedProofFingerprint = fingerprint

  invoice.status = "proof_approved"
  invoice.squareEnvironment = "sandbox"
  invoice.paymentUrl =
    "https://example.invalid/existing-legacy-link"

  await invoice.save()

  const before = await Invoice.findById(invoice._id).lean()

  const app = express()
  app.use(express.json())
  app.use("/api/invoices", invoiceRoutes)

  server = app.listen(0, "127.0.0.1")

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const token = jwt.sign({
    id: new mongoose.Types.ObjectId().toString(),
    role: "admin",
    email: "admin@example.invalid"
  }, process.env.JWT_SECRET, {
    expiresIn: "5m"
  })

  const url =
    `http://127.0.0.1:${server.address().port}` +
    `/api/invoices/${invoice._id}/send`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  })

  const body = await response.json()

  assert.equal(response.status, 423, JSON.stringify(body))
  assert.equal(body.success, false)
  assert.match(
    body.message,
    /disabled pending durable payment execution/
  )

  console.log("APPROVED INVOICE EMAIL: BLOCKED (423)")

  assert.equal(attemptedSends, 0)
  console.log("SENDGRID DELIVERY ATTEMPTS: ZERO")

  const archivedEmails = await AdminEmail.countDocuments({
    relatedInvoiceId: invoice._id
  })

  assert.equal(archivedEmails, 0)
  console.log("EMAIL ARCHIVE WRITES: ZERO")

  const after = await Invoice.findById(invoice._id).lean()

  assert.equal(after.paymentStatus, "unpaid")
  assert.equal(after.paymentUrl, before.paymentUrl)
  assert.equal(after.status, before.status)
  assert.equal(after.squarePaymentId, before.squarePaymentId)
  assert.equal(after.paidAt, before.paidAt)
  assert.deepEqual(after.timeline, before.timeline)

  console.log("STORED LEGACY LINK: UNCHANGED")
  console.log("INVOICE STATUS AND TIMELINE: UNCHANGED")
  console.log("PAYMENT REMAINS UNPAID: PASS")
  console.log("APPROVED INVOICE EMAIL SAFETY: PASS")

} catch (error) {
  console.error("INVOICE EMAIL SAFETY TEST FAILED:", error)
  process.exitCode = 1

} finally {
  process.env.SENDGRID_API_KEY = ""

  if (sendStubInstalled) {
    sgMail.send = originalSend
  }

  if (server) {
    await new Promise(resolve => server.close(resolve))
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (replica) {
    await replica.stop()
    console.log("TEMPORARY DATABASE STOPPED")
  }

  if (tempDir) {
    await fs.rm(tempDir, {
      recursive: true,
      force: true
    })
    console.log("TEMPORARY FILES REMOVED")
  }
}
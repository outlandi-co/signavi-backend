import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import express from "express"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

Object.assign(process.env, {
  NODE_ENV: "test",
  SQUARE_ENVIRONMENT: "sandbox",
  SMART_SHIPPING_V3_ENABLED: "true",
  SMART_SHIPPING_V3_SQUARE_CREATE_ENABLED: "false",
  SQUARE_ACCESS_TOKEN: "DUMMY_NOT_A_REAL_SQUARE_TOKEN",
  SQUARE_SANDBOX_ACCESS_TOKEN: "",
  SQUARE_PRODUCTION_ACCESS_TOKEN: "",
  SQUARE_LOCATION_ID: "DUMMY_TEST_LOCATION",
  SENDGRID_API_KEY: ""
})

delete process.env.MONGO_URI

const sha256 = value =>
  crypto.createHash("sha256").update(value).digest("hex")

let replica
let server
let uploadDir

try {
  uploadDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "signavi-proof-regression-")
  )

  process.env.UPLOAD_DIR = uploadDir

  replica = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" }
  })

  const uri = replica.getUri()
  const address = new URL(uri)

  assert.equal(address.protocol, "mongodb:")
  assert.ok(
    ["localhost", "127.0.0.1"].includes(address.hostname)
  )

  await mongoose.connect(uri, {
    dbName: "signavi_shipping_v3_dev",
    serverSelectionTimeoutMS: 10000
  })

  assert.equal(
    mongoose.connection.db.databaseName,
    "signavi_shipping_v3_dev"
  )

  const { default: Invoice } =
    await import("../models/Invoice.js")

  const { default: invoiceRoutes } =
    await import("../routes/invoiceRoutes.js")

  const { PROOF_TERMS_VERSION } =
    await import("../controllers/invoiceController.js")

  const invoice = await Invoice.create({
    customerName: "Sandbox Approval Customer",
    customerEmail: "sandbox@example.invalid",
    status: "proof_uploaded",
    paymentStatus: "unpaid",
    items: [
      { name: "Test Shirt", quantity: 2, price: 25 }
    ],
    shipping: 5,
    notes: "Disposable regression test",
    finalProof: {
      files: [{
        url: "https://example.invalid/proof.png",
        fileName: "proof.png",
        mimeType: "image/png"
      }]
    }
  })

  const files = invoice.finalProof.files.map(file => ({
    url: String(file.url || ""),
    fileName: String(file.fileName || ""),
    mimeType: String(file.mimeType || "")
  }))

  const fingerprint = sha256(JSON.stringify({
    invoiceId: String(invoice._id),
    files,
    items: invoice.items.map(({ name, quantity, price }) => ({
      name, quantity, price
    })),
    notes: invoice.notes || "",
    shipping: invoice.shipping || 0,
    total: invoice.total || 0
  }))

  const token = crypto.randomBytes(32).toString("hex")

  invoice.approvalAccess = {
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 86400000),
    proofFingerprint: fingerprint,
    usedAt: null
  }

  await invoice.save()

  const app = express()
  app.use(express.json())
  app.use("/api/invoices", invoiceRoutes)

  server = app.listen(0, "127.0.0.1")

  await new Promise((resolve, reject) => {
    if (server.listening) return resolve()
    server.once("listening", resolve)
    server.once("error", reject)
  })

  const endpoint =
    `http://127.0.0.1:${server.address().port}` +
    `/api/invoices/${invoice._id}/approve-proof`

  const approve = async () => {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-signavi-invoice-approval-token": token
      },
      body: JSON.stringify({
        approvalName: "Sandbox Approval Customer",
        termsAccepted: true,
        termsVersion: PROOF_TERMS_VERSION
      })
    })

    return {
      status: response.status,
      body: await response.json()
    }
  }

  const first = await approve()

  assert.equal(first.status, 200, JSON.stringify(first.body))
  assert.equal(first.body.success, true)

  assert.match(
    first.body.paymentWarning || "",
    /payment link creation failed/i
  )

  console.log("VALID PROOF APPROVAL: PASS")
  console.log("PAYMENT WARNING: PASS")

  const saved = await Invoice.findById(invoice._id).lean()

  assert.equal(saved.finalProof.approved, true)
  assert.equal(saved.finalProof.termsAccepted, true)
  assert.equal(saved.status, "proof_approved")
  assert.equal(saved.paymentStatus, "unpaid")
  assert.equal(saved.paymentUrl, "")
  assert.equal(saved.squarePaymentLinkId, "")
  assert.equal(saved.squareOrderId, "")
  assert.equal(saved.squarePaymentId, "")
  assert.equal(saved.paidAt, null)
  assert.ok(saved.approvalAccess.usedAt)

  console.log("DURABLE APPROVAL: PASS")
  console.log("PAYMENT REMAINS UNPAID: PASS")

  const second = await approve()

  assert.equal(second.status, 403)
  assert.equal(second.body.success, false)

  console.log("TOKEN REUSE BLOCKED: PASS")
  console.log("ALL INVOICE PROOF APPROVAL REGRESSIONS PASSED")

} catch (error) {
  console.error("PROOF APPROVAL REGRESSION FAILED:", error)
  process.exitCode = 1

} finally {
  if (server) {
    await new Promise(resolve => server.close(resolve))
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }

  if (replica) {
    await replica.stop()
    console.log("DISPOSABLE DATABASE STOPPED")
  }

  if (uploadDir) {
    await fs.rm(uploadDir, {
      recursive: true,
      force: true
    })
    console.log("TEMPORARY FILES REMOVED")
  }
}
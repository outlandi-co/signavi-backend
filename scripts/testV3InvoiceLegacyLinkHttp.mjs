import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import express from "express"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import { MongoMemoryReplSet } from "mongodb-memory-server"

Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "LOCAL_ONLY_V3_LEGACY_LINK_HTTP_TEST",
  SQUARE_ENVIRONMENT: "sandbox",
  SQUARE_ACCESS_TOKEN: "DUMMY_NOT_A_REAL_SQUARE_TOKEN",
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
let uploadDir

try {
  uploadDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "signavi-legacy-regression-")
  )

  process.env.UPLOAD_DIR = uploadDir

  replica = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger"
    }
  })

  const uri = replica.getUri()
  const parsed = new URL(uri)

  assert.equal(parsed.protocol, "mongodb:")
  assert.ok(
    ["127.0.0.1", "localhost"].includes(parsed.hostname)
  )

  await mongoose.connect(uri, {
    dbName: "signavi_legacy_invoice_isolated_test",
    serverSelectionTimeoutMS: 10000
  })

  const { default: Invoice } =
    await import("../models/Invoice.js")

  const { default: invoiceRoutes } =
    await import("../routes/invoiceRoutes.js")

  const { PROOF_TERMS_VERSION } =
    await import("../controllers/invoiceController.js")

  const invoice = await Invoice.create({
    customerName: "Legacy Link Regression",
    customerEmail: "legacy@example.invalid",
    status: "proof_uploaded",
    paymentStatus: "unpaid",
    items: [{
      name: "Test Shirt",
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

  const token = crypto.randomBytes(32).toString("hex")
  const legacyUrl = "https://example.invalid/legacy-payment"

  invoice.finalProof.approved = true
  invoice.finalProof.approvedAt = new Date()
  invoice.finalProof.termsAccepted = true
  invoice.finalProof.termsAcceptedAt = new Date()
  invoice.finalProof.termsVersion = PROOF_TERMS_VERSION
  invoice.finalProof.termsText = "Test approval"
  invoice.finalProof.approvedProofFingerprint = fingerprint

  invoice.approvalAccess = {
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 86400000),
    proofFingerprint: fingerprint,
    usedAt: null
  }

  invoice.status = "proof_approved"
  invoice.squareEnvironment = "sandbox"
  invoice.paymentUrl = legacyUrl

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

  const base =
    `http://127.0.0.1:${server.address().port}` +
    `/api/invoices/${invoice._id}`

  const adminToken = jwt.sign({
    id: new mongoose.Types.ObjectId().toString(),
    role: "admin",
    email: "admin@example.invalid"
  }, process.env.JWT_SECRET, {
    expiresIn: "5m"
  })

  const adminResponse = await fetch(
    base + "/create-payment-link",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`
      }
    }
  )

  const adminBody = await adminResponse.json()

  assert.equal(
    adminResponse.status,
    423,
    JSON.stringify(adminBody)
  )
  assert.equal(adminBody.success, false)
  assert.equal(adminBody.paymentUrl, undefined)

  console.log("ADMIN LEGACY LINK REUSE: BLOCKED (423)")

  const customerResponse = await fetch(
    base + "/proof-access",
    {
      headers: {
        "x-signavi-invoice-approval-token": token
      }
    }
  )

  const customerBody = await customerResponse.json()

  assert.equal(
    customerResponse.status,
    200,
    JSON.stringify(customerBody)
  )
  assert.equal(customerBody.success, true)
  assert.equal(customerBody.data.paymentUrl, "")

  assert.equal(
    customerResponse.headers.get("cache-control"),
    "no-store"
  )

  console.log("CUSTOMER LEGACY URL: HIDDEN")
  console.log("VALID PROOF ACCESS: PASS")

  const saved = await Invoice.findById(invoice._id).lean()

  assert.equal(saved.paymentUrl, legacyUrl)
  assert.equal(saved.paymentStatus, "unpaid")
  assert.equal(saved.squarePaymentId, "")
  assert.equal(saved.paidAt, null)

  console.log("STORED LEGACY LINK: PRESERVED")
  console.log("INVOICE REMAINS UNPAID: PASS")
  console.log("LEGACY LINK HTTP REGRESSION: PASS")

} catch (error) {
  console.error("LEGACY HTTP REGRESSION FAILED:", error)
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
    console.log("TEMPORARY DATABASE STOPPED")
  }

  if (uploadDir) {
    await fs.rm(uploadDir, {
      recursive: true,
      force: true
    })
    console.log("TEMPORARY FILES REMOVED")
  }
}
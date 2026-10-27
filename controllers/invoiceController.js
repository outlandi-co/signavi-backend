
import crypto from "crypto"
import sgMail from "@sendgrid/mail"
import { SquareClient, SquareEnvironment } from "square"

import Invoice from "../models/Invoice.js"
import Notification from "../models/Notification.js"
import AdminEmail from "../models/AdminEmail.js"

const CLIENT_URL = (
  process.env.CLIENT_URL ||
  "https://signavistudio.store"
).replace(/\/$/, "")

const BACKEND_URL = (
  process.env.BACKEND_URL ||
  "https://signavi-backend.onrender.com"
).replace(/\/$/, "")

const LOGO_URL = `${CLIENT_URL}/signavi-logo.png`

const FROM_EMAIL =
  process.env.INFO_EMAIL ||
  process.env.EMAIL_FROM ||
  "info@signavistudio.store"

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

// Keep the version associated with its exact wording.
export const PROOF_TERMS_VERSION =
  "signavi-custom-proof-v1"

export const PROOF_TERMS_TEXT =
  "I have reviewed the final artwork and order specifications, including " +
  "spelling, colors, dimensions, design placement, selected products, and " +
  "quantities. I approve these proofs for production. Changes requested " +
  "after production begins may result in additional charges or delays. " +
  "Custom-made products may not be returnable for a change of preference " +
  "subject to applicable law. This approval does not waive my rights " +
  "regarding defective goods or orders that do not match the approved proof."

const APPROVAL_LINK_DAYS = 14


const squareMode = String(
  process.env.SQUARE_ENVIRONMENT || ""
).trim().toLowerCase()

const squareEnvironment =
  squareMode === "sandbox"
    ? SquareEnvironment.Sandbox
    : squareMode === "production"
      ? SquareEnvironment.Production
      : null

const squareToken = String(
  process.env.SQUARE_ACCESS_TOKEN || ""
).trim()

const squareClient = squareEnvironment && squareToken
  ? new SquareClient({
      token: squareToken,
      environment: squareEnvironment
    })
  : null


if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  console.log("INVOICE SENDGRID READY")
} else {
  console.warn("SENDGRID_API_KEY missing for invoice email")
}

const emitAdminNotification = (req, notification) => {
  req.app.get("io")?.emit("adminNotification", notification)
}

const addTimeline = (invoice, status, note) => {
  if (typeof invoice.addTimeline === "function") {
    invoice.addTimeline(status, note)
  } else {
    invoice.timeline = invoice.timeline || []
    invoice.timeline.push({
      status,
      note,
      date: new Date()
    })
  }
}

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
  )

const sha256 = (value) =>
  crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")

const proofFilesFor = (invoice) => {
  const files = invoice.finalProof?.files || []

  if (files.length) {
    return files.map((file) => ({
      url: String(file.url || ""),
      fileName: String(file.fileName || ""),
      mimeType: String(file.mimeType || "")
    }))
  }

  if (invoice.finalProof?.imageUrl) {
    return [
      {
        url: String(invoice.finalProof.imageUrl),
        fileName: String(
          invoice.finalProof.fileName || "Final Proof"
        ),
        mimeType: ""
      }
    ]
  }

  return []
}

// Link approval to both the artwork and order specifications.
const proofFingerprint = (invoice) =>
  sha256(
    JSON.stringify({
      invoiceId: String(invoice._id),
      files: proofFilesFor(invoice),
      items: (invoice.items || []).map(
        ({ name, quantity, price }) => ({
          name,
          quantity,
          price
        })
      ),
      notes: invoice.notes || "",
      shipping: invoice.shipping || 0,
      total: invoice.total || 0
    })
  )

const isProofApproved = (invoice) =>
  invoice.finalProof?.approved === true &&
  invoice.finalProof?.termsAccepted === true &&
  Boolean(invoice.finalProof?.approvedAt) &&
  Boolean(invoice.finalProof?.termsAcceptedAt) &&
  Boolean(invoice.finalProof?.termsVersion) &&
  Boolean(invoice.finalProof?.termsText) &&
  proofFilesFor(invoice).length > 0 &&
  invoice.finalProof?.approvedProofFingerprint ===
    proofFingerprint(invoice)

const clearApproval = (invoice) => {
  invoice.finalProof.approved = false
  invoice.finalProof.approvedAt = null
  invoice.finalProof.approvalName = ""
  invoice.finalProof.approvalEmail = ""
  invoice.finalProof.termsAccepted = false
  invoice.finalProof.termsAcceptedAt = null
  invoice.finalProof.termsVersion = ""
  invoice.finalProof.termsText = ""
  invoice.finalProof.approvedFiles = []
  invoice.finalProof.approvedProofFingerprint = ""
  invoice.finalProof.approvalIp = ""
  invoice.finalProof.approvalUserAgent = ""

  invoice.approvalAccess = {
    tokenHash: "",
    expiresAt: null,
    proofFingerprint: "",
    usedAt: null
  }
}

const issueApprovalToken = (invoice) => {
  const token = crypto.randomBytes(32).toString("hex")

  invoice.approvalAccess = {
    tokenHash: sha256(token),
    expiresAt: new Date(
      Date.now() +
        APPROVAL_LINK_DAYS * 24 * 60 * 60 * 1000
    ),
    proofFingerprint: proofFingerprint(invoice),
    usedAt: null
  }

  return token
}

const readApprovalToken = (req) => {
  const token =
    req.get("x-signavi-invoice-approval-token") || ""

  return (
    typeof token === "string" &&
    /^[0-9a-f]{64}$/i.test(token)
  )
    ? token
    : ""
}

const validApprovalToken = (
  invoice,
  token,
  { allowUsed = false } = {}
) => {
  const stored =
    invoice.approvalAccess?.tokenHash || ""

  const expires =
    invoice.approvalAccess?.expiresAt

  if (
    !token ||
    !/^[0-9a-f]{64}$/i.test(token) ||
    !/^[0-9a-f]{64}$/i.test(stored)
  ) {
    return false
  }

  if (
    !expires ||
    new Date(expires).getTime() <= Date.now()
  ) {
    return false
  }

  if (
    !allowUsed &&
    invoice.approvalAccess?.usedAt
  ) {
    return false
  }

  if (
    invoice.approvalAccess?.proofFingerprint !==
    proofFingerprint(invoice)
  ) {
    return false
  }

  const actual = Buffer.from(
    sha256(token),
    "hex"
  )

  const expected = Buffer.from(
    stored,
    "hex"
  )

  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  )
}

// Return only the information customers need.
const publicInvoice = (invoice) => ({
  _id: invoice._id,
  invoiceNumber: invoice.invoiceNumber,
  customerName: invoice.customerName,
  customerEmail: invoice.customerEmail,
  items: invoice.items,
  subtotal: invoice.subtotal,
  tax: invoice.tax,
  shipping: invoice.shipping,
  total: invoice.total,
  notes: invoice.notes,
  status: invoice.status,
  paymentStatus: invoice.paymentStatus,

  // Hide legacy payment URLs until durable invoice execution is enabled.
  paymentUrl: "",

  finalProof: {
    imageUrl: invoice.finalProof?.imageUrl || "",
    fileName: invoice.finalProof?.fileName || "",
    files: proofFilesFor(invoice),
    approved: Boolean(
      invoice.finalProof?.approved
    ),
    approvedAt:
      invoice.finalProof?.approvedAt || null,
    approvalName:
      invoice.finalProof?.approvalName || "",
    termsAccepted: Boolean(
      invoice.finalProof?.termsAccepted
    ),
    termsVersion:
      invoice.finalProof?.termsVersion || ""
  },

  agreement: {
    version: PROOF_TERMS_VERSION,
    text: PROOF_TERMS_TEXT
  }
})

// =====================================================
// SQUARE INVOICE PAYMENT
// =====================================================


const createSquarePaymentLinkForInvoice = async (
  invoice
) => {
  if (!squareClient || !String(process.env.SQUARE_LOCATION_ID || "").trim()) {
    throw Object.assign(
      new Error(
        "Square payments are not configured for this backend."
      ),
      { status: 503 }
    )
  }

  if (!isProofApproved(invoice)) {

    throw Object.assign(
      new Error(
        "Final proof and terms must be approved before payment."
      ),
      { status: 409 }
    )
  }

  if (
    invoice.paymentStatus === "paid" ||
    invoice.paymentStatus === "refunded"
  ) {
    throw Object.assign(
      new Error(
        "This invoice cannot accept another payment."
      ),
      { status: 409 }
    )
  }


  // Smart Shipping V3 safety gate.
  // No configuration setting can bypass this guard.
  // Replace only with verified durable payment execution.
  throw Object.assign(
    new Error(
      "Invoice payment-link creation is disabled pending durable payment execution."
    ),
    { status: 423 }
  )
  const amount = Math.round(
    Number(invoice.total || 0) * 100
  )

  if (
    !Number.isSafeInteger(amount) ||
    amount < 1
  ) {
    throw Object.assign(
      new Error(
        "Invoice total must be greater than $0.00"
      ),
      { status: 400 }
    )
  }

  const response =
    await squareClient.checkout.paymentLinks.create({
      idempotencyKey: crypto.randomUUID(),

      quickPay: {
        name: `Invoice ${invoice.invoiceNumber}`,

        priceMoney: {
          amount: BigInt(amount),
          currency: "USD"
        },

        locationId:
          process.env.SQUARE_LOCATION_ID
      },

      checkoutOptions: {
        redirectUrl:
          `${CLIENT_URL}/invoice/${invoice._id}`
      }
    })

const link = response.paymentLink

if (!link?.url || !link?.id) {
  throw new Error(
    "Square did not return a complete invoice payment link."
  )
}

const squareOrderId =
  link.orderId || link.order_id || ""

if (!squareOrderId) {
  throw new Error(
    "Square payment link is missing its associated order ID."
  )
}

invoice.paymentUrl = link.url
invoice.squareCheckoutId = link.id
invoice.squarePaymentLinkId = link.id
invoice.squareOrderId = squareOrderId
invoice.squareEnvironment = squareMode


  invoice.status = "payment_required"

  addTimeline(
    invoice,
    "payment_required",
    "Payment link created after final proof approval."
  )

  await invoice.save()

  return invoice.paymentUrl
}

const errorResponse = (
  res,
  error,
  context
) => {
  console.error(context, error)

  res.status(error.status || 500).json({
    success: false,
    message: error.status
      ? error.message
      : "Invoice operation failed."
  })
}

// =====================================================
// CREATE INVOICE
// =====================================================

export const createInvoice = async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      items = [],
      shipping = 0,
      notes = ""
    } = req.body

    const invoice = new Invoice({
      customerName,
      customerEmail,
      items,
      shipping,
      notes
    })

    addTimeline(
      invoice,
      "draft",
      "Invoice created."
    )

    await invoice.save()

    res.status(201).json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "CREATE INVOICE ERROR"
    )
  }
}

// =====================================================
// GET ALL INVOICES â€” ADMIN
// =====================================================

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({
      createdAt: -1
    })

    res.json({
      success: true,
      data: invoices
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "GET INVOICES ERROR"
    )
  }
}

// =====================================================
// GET ONE INVOICE â€” ADMIN
// Route must use requireAuth and requireAdmin.
// =====================================================

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "GET INVOICE ERROR"
    )
  }
}

// =====================================================
// CUSTOMER PROOF VIEW
// Requires the emailed approval token.
// A route for this handler must still be added.
// =====================================================

export const getCustomerProofInvoice = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    ).select("+approvalAccess.tokenHash")

    if (
      !invoice ||
      !validApprovalToken(
        invoice,
        readApprovalToken(req),
        { allowUsed: true }
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Approval link is invalid or expired."
      })
    }

    res.set("Cache-Control", "no-store")

    res.json({
      success: true,
      data: publicInvoice(invoice)
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "CUSTOMER PROOF ERROR"
    )
  }
}

// =====================================================
// CREATE SQUARE PAYMENT LINK â€” ADMIN
// =====================================================

export const createInvoicePaymentLink = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const paymentUrl =
      await createSquarePaymentLinkForInvoice(
        invoice
      )

    res.json({
      success: true,
      paymentUrl,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "CREATE PAYMENT LINK ERROR"
    )
  }
}

// =====================================================
// SEND INVOICE EMAIL
// Pending approval: sends proof-review link.
// Approved: sends Square payment link.
// =====================================================

export const sendInvoiceEmail = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    ).select("+approvalAccess.tokenHash")

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (!process.env.SENDGRID_API_KEY) {
      throw Object.assign(
        new Error(
          "SENDGRID_API_KEY is not configured"
        ),
        { status: 503 }
      )
    }

    if (!proofFilesFor(invoice).length) {
      throw Object.assign(
        new Error(
          "Upload a final proof before sending this invoice."
        ),
        { status: 409 }
      )
    }

    if (
      !isProofApproved(invoice) &&
      invoice.paymentUrl
    ) {
      throw Object.assign(
        new Error(
          "A Square payment link already exists for this unapproved proof. Deactivate that link in Square before resuming the approval workflow."
        ),
        { status: 409 }
      )
    }

    let actionUrl
    let actionLabel
    let introductoryText

    if (isProofApproved(invoice)) {
      if (invoice.paymentStatus === "paid") {
        throw Object.assign(
          new Error("Invoice is already paid."),
          { status: 409 }
        )
      }

      actionUrl =
        await createSquarePaymentLinkForInvoice(
          invoice
        )

      actionLabel = "Pay Approved Invoice"
      introductoryText =
        "Your approved invoice is ready for payment."
    } else {
      const token = issueApprovalToken(invoice)

      actionUrl =
        `${CLIENT_URL}/proof/${invoice._id}` +
        `?approvalToken=${token}`

      actionLabel =
        "Review and Approve Final Proof"

      introductoryText =
        "Please review your proof and accept the custom-order terms before paying."

      await invoice.save()
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;border:1px solid #ddd;padding:30px;">
        <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:20px;">
          <img src="${escapeHtml(LOGO_URL)}" style="width:140px;" alt="Signavi Studio" />
          <h1>SIGNAVI STUDIO</h1>
          <p>Signature | Vision | Veteran Owned</p>
        </div>
        <div style="padding:24px 0;">
          <p>Hi ${escapeHtml(invoice.customerName)},</p>
          <p>${escapeHtml(introductoryText)}</p>
          <div style="margin:24px 0;">
            <a href="${escapeHtml(actionUrl)}" style="background:#111;color:#fff;padding:14px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
              ${escapeHtml(actionLabel)}
            </a>
          </div>
          <h2>Total: $${Number(invoice.total || 0).toFixed(2)}</h2>
        </div>
      </div>
    `

    const [sendGridResponse] =
      await sgMail.send({
        to: invoice.customerEmail,

        from: {
          email: FROM_EMAIL,
          name: "SignaVi Studio"
        },

        subject:
          `Invoice ${invoice.invoiceNumber} from SignaVi Studio`,

        html
      })

    console.log("INVOICE EMAIL SENT", {
      to: invoice.customerEmail,
      invoiceNumber: invoice.invoiceNumber,
      statusCode:
        sendGridResponse?.statusCode || null
    })

    // Do not save the raw approval token
    // in the administrative email archive.
    const loggedHtml = isProofApproved(invoice)
      ? html
      : html.replace(
          escapeHtml(actionUrl),
          "[Private approval link omitted]"
        )

    await AdminEmail.create({
      to: invoice.customerEmail,

      subject:
        `Invoice ${invoice.invoiceNumber} from SignaVi Studio`,

      message:
        `Invoice information sent to ${invoice.customerEmail}.`,

      html: loggedHtml,
      status: "sent",
      relatedInvoiceId: invoice._id,
      createdBy: ADMIN_EMAIL,
      sentAt: new Date()
    })

    if (!isProofApproved(invoice)) {
      invoice.status = "proof_uploaded"
    }

    addTimeline(
      invoice,
      "email_sent",
      `Customer email sent: ${actionLabel}.`
    )

    await invoice.save()

    const safeInvoice = invoice.toObject()
    delete safeInvoice.approvalAccess

    res.json({
      success: true,
      data: safeInvoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "SEND EMAIL ERROR"
    )
  }
}

// =====================================================
// UPDATE INVOICE â€” ADMIN
// Does not permit direct payment or approval changes.
// =====================================================

export const updateInvoice = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const allowed = [
      "customerName",
      "customerEmail",
      "items",
      "shipping",
      "notes",
      "shippingInfo"
    ]

    if (
      !req.body ||
      typeof req.body !== "object" ||
      Array.isArray(req.body)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid invoice update."
      })
    }

    const keys = Object.keys(req.body)

    if (
      !keys.length ||
      keys.some((key) => !allowed.includes(key))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Only customer, item, shipping and note fields may be edited here."
      })
    }

    const changesProof = keys.some((key) =>
      [
        "customerName",
        "customerEmail",
        "items",
        "shipping",
        "notes"
      ].includes(key)
    )

    if (
      changesProof &&
      (
        invoice.finalProof?.approved ||
        invoice.paymentUrl ||
        invoice.paymentStatus !== "unpaid"
      )
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Invoice has an approval or payment history. Create a revised invoice instead."
      })
    }

    if ("shippingInfo" in req.body) {
      const info = req.body.shippingInfo

      if (
        !info ||
        typeof info !== "object" ||
        Array.isArray(info) ||
        Object.keys(info).some(
          (key) =>
            ![
              "carrier",
              "trackingNumber",
              "trackingUrl"
            ].includes(key)
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid shipping information."
        })
      }

      for (const key of [
        "carrier",
        "trackingNumber",
        "trackingUrl"
      ]) {
        if (Object.hasOwn(info, key)) {
          invoice.shippingInfo[key] = String(
            info[key] || ""
          )
        }
      }
    }

    for (const key of allowed.filter(
      (name) => name !== "shippingInfo"
    )) {
      if (Object.hasOwn(req.body, key)) {
        invoice[key] = req.body[key]
      }
    }

    if (
      changesProof &&
      proofFilesFor(invoice).length
    ) {
      clearApproval(invoice)

      invoice.status = "proof_uploaded"

      addTimeline(
        invoice,
        "proof_changed",
        "Invoice specifications changed; approval link revoked. Send a new proof link."
      )
    }

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "UPDATE INVOICE ERROR"
    )
  }
}

// =====================================================
// DELETE INVOICE â€” ADMIN
// =====================================================

export const deleteInvoice = async (
  req,
  res
) => {
  try {
    const invoice =
      await Invoice.findByIdAndDelete(
        req.params.id
      )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      message: "Invoice deleted"
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "DELETE INVOICE ERROR"
    )
  }
}

// =====================================================
// UPLOAD FINAL PROOF â€” ADMIN
// Revokes any prior approval and approval link.
// =====================================================

export const uploadFinalProof = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (
      invoice.paymentStatus !== "unpaid" ||
      invoice.paymentUrl
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Do not replace proofs while a Square payment link exists or payment has been recorded. Resolve the existing payment link first."
      })
    }

    const uploadedFiles =
      Array.isArray(req.files)
        ? req.files
        : req.file
          ? [req.file]
          : []

    if (!uploadedFiles.length) {
      return res.status(400).json({
        success: false,
        message:
          "At least one final proof file is required"
      })
    }

    const files = uploadedFiles.map(
      (file) => ({
        url:
          `${BACKEND_URL}/uploads/proofs/` +
          file.filename,
        fileName: file.originalname,
        mimeType: file.mimetype
      })
    )

    invoice.finalProof = {
      imageUrl: files[0].url,
      fileName: files[0].fileName,
      files,

      approved: false,
      approvedAt: null,
      approvalName: "",
      approvalEmail: "",

      termsAccepted: false,
      termsAcceptedAt: null,
      termsVersion: "",
      termsText: "",

      approvedFiles: [],
      approvedProofFingerprint: "",

      approvalIp: "",
      approvalUserAgent: ""
    }

    invoice.approvalAccess = {
      tokenHash: "",
      expiresAt: null,
      proofFingerprint: "",
      usedAt: null
    }

    invoice.status = "proof_uploaded"

    addTimeline(
      invoice,
      "proof_uploaded",
      `${files.length} final proof file(s) uploaded; previous approvals invalidated.`
    )

    await invoice.save()

    res.json({
      success: true,
      filesUploaded: files.length,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "UPLOAD FINAL PROOF ERROR"
    )
  }
}

// =====================================================
// CUSTOMER FINAL PROOF APPROVAL
// =====================================================

export const approveFinalProof = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    ).select("+approvalAccess.tokenHash")

    if (
      !invoice ||
      !validApprovalToken(
        invoice,
        readApprovalToken(req)
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Approval link is invalid, expired, or already used."
      })
    }

    if (!proofFilesFor(invoice).length) {
      return res.status(409).json({
        success: false,
        message:
          "No final proof is available for approval."
      })
    }

    if (invoice.finalProof?.approved) {
      return res.status(409).json({
        success: false,
        message: "This proof is already approved."
      })
    }

    if (
      req.body?.termsAccepted !== true ||
      req.body?.termsVersion !==
        PROOF_TERMS_VERSION
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You must review and accept the current proof terms."
      })
    }

    const approvalName = String(
      req.body?.approvalName || ""
    ).trim()

    if (
      approvalName.length < 2 ||
      approvalName.length > 150
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Enter your full name to approve the proof."
      })
    }

    const now = new Date()
    const fingerprint = proofFingerprint(invoice)

    // Atomic update prevents the same approval
    // token from being consumed twice.
    const updateResult =
      await Invoice.updateOne(
        {
          _id: invoice._id,
          updatedAt: invoice.updatedAt,

          "approvalAccess.tokenHash":
            sha256(readApprovalToken(req)),

          "approvalAccess.usedAt": null,

          "approvalAccess.expiresAt": {
            $gt: now
          },

          "approvalAccess.proofFingerprint":
            fingerprint,

          "finalProof.approved": {
            $ne: true
          }
        },

        {
          $set: {
            "finalProof.approved": true,
            "finalProof.approvedAt": now,
            "finalProof.approvalName":
              approvalName,
            "finalProof.approvalEmail":
              invoice.customerEmail,

            "finalProof.termsAccepted": true,
            "finalProof.termsAcceptedAt": now,
            "finalProof.termsVersion":
              PROOF_TERMS_VERSION,
            "finalProof.termsText":
              PROOF_TERMS_TEXT,

            "finalProof.approvedFiles":
              proofFilesFor(invoice),

            "finalProof.approvedProofFingerprint":
              fingerprint,

            "finalProof.approvalIp":
              String(req.ip || "").slice(
                0,
                100
              ),

            "finalProof.approvalUserAgent":
              String(
                req.get("user-agent") || ""
              ).slice(0, 500),

            "approvalAccess.usedAt": now,

            status:
              invoice.paymentStatus === "paid"
                ? "ready_for_production"
                : "proof_approved"
          },

          $push: {
            timeline: {
              status: "proof_approved",
              note:
                `${approvalName} accepted ` +
                `${PROOF_TERMS_VERSION} and ` +
                "approved the final proof.",
              date: now
            }
          }
        },

        {
          runValidators: true
        }
      )

    if (updateResult.modifiedCount !== 1) {
      return res.status(409).json({
        success: false,
        message:
          "This proof changed or the approval link was already used. Request a new link."
      })
    }

    const approvedInvoice =
      await Invoice.findById(invoice._id)

    if (!approvedInvoice) {
      throw new Error(
        "Invoice disappeared after approval."
      )
    }

    // Offer payment only after the agreement
    // and approval evidence are saved.
    let paymentWarning = ""

    if (
      approvedInvoice.paymentStatus === "unpaid"
    ) {
      try {
        await createSquarePaymentLinkForInvoice(
          approvedInvoice
        )
      } catch (error) {
        console.error(
          "POST-APPROVAL SQUARE LINK ERROR",
          error
        )

        paymentWarning =
          "Proof approved, but payment link creation failed. Please contact Signavi Studio."
      }
    }

    const notification =
      await Notification.create({
        userEmail: ADMIN_EMAIL,
        title: "Final Proof Approved",

        text:
          `${invoice.customerName} approved final proofs for ` +
          `${invoice.invoiceNumber}.`,

        type: "proof",
        invoiceId: invoice._id,
        link: "/admin/invoices",
        read: false,
        archived: false
      })

    emitAdminNotification(
      req,
      notification
    )

    res.set("Cache-Control", "no-store")

    res.json({
      success: true,
      data: publicInvoice(approvedInvoice),

      ...(paymentWarning
        ? { paymentWarning }
        : {})
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "APPROVE FINAL PROOF ERROR"
    )
  }
}

// =====================================================
// MARK PAID â€” ADMIN MANUAL RECONCILIATION
// =====================================================

export const markInvoicePaid = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.paymentStatus === "paid") {
      return res.status(409).json({
        success: false,
        message:
          "Invoice is already marked paid."
      })
    }

    // Admin-only manual payment recording.
    // This is not proof of a Square payment.
    invoice.paymentStatus = "paid"
    invoice.paidAt = new Date()

    invoice.status =
      isProofApproved(invoice)
        ? "ready_for_production"
        : "paid"

    addTimeline(
      invoice,
      "paid",
      `Admin recorded payment of $${Number(
        invoice.total || 0
      ).toFixed(2)}. Confirmation must be reconciled with Square.`
    )

    await invoice.save()

    const notification =
      await Notification.create({
        userEmail: ADMIN_EMAIL,
        title: "Payment Received",

        text:
          `${invoice.customerName} paid ` +
          `${invoice.invoiceNumber} for $` +
          `${Number(
            invoice.total || 0
          ).toFixed(2)}.`,

        type: "payment",
        invoiceId: invoice._id,
        link: "/admin/invoices",
        read: false,
        archived: false
      })

    emitAdminNotification(
      req,
      notification
    )

    res.json({
      success: true,
      data: invoice,
      notification
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "MARK PAID ERROR"
    )
  }
}

// =====================================================
// START PRODUCTION â€” ADMIN
// Requires payment and approved current proof.
// =====================================================

export const startProduction = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.paymentStatus !== "paid") {
      return res.status(409).json({
        success: false,
        message:
          "Invoice must be paid before production."
      })
    }

    if (!isProofApproved(invoice)) {
      return res.status(409).json({
        success: false,
        message:
          "Customer must accept the terms and approve the current final proof before production."
      })
    }

    if (
      ![
        "paid",
        "payment_required",
        "proof_approved",
        "ready_for_production"
      ].includes(invoice.status)
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Invoice is not in a production-ready state."
      })
    }

    invoice.status = "production"

    addTimeline(
      invoice,
      "production",
      "Production started after approved proof and recorded payment."
    )

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "START PRODUCTION ERROR"
    )
  }
}

// =====================================================
// MARK SHIPPED â€” ADMIN
// =====================================================

export const markInvoiceShipped = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.status !== "production") {
      return res.status(409).json({
        success: false,
        message:
          "Production must start before an invoice can be shipped."
      })
    }

    invoice.status = "shipped"

    invoice.shippingInfo = {
      ...(
        invoice.shippingInfo?.toObject?.() ||
        invoice.shippingInfo ||
        {}
      ),

      shippedAt: new Date()
    }

    addTimeline(
      invoice,
      "shipped",
      "Invoice marked as shipped."
    )

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "MARK SHIPPED ERROR"
    )
  }
}

// =====================================================
// MARK DELIVERED â€” ADMIN
// =====================================================

export const markInvoiceDelivered = async (
  req,
  res
) => {
  try {
    const invoice = await Invoice.findById(
      req.params.id
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.status !== "shipped") {
      return res.status(409).json({
        success: false,
        message:
          "Invoice must be shipped before delivery is recorded."
      })
    }

    invoice.status = "delivered"

    invoice.shippingInfo = {
      ...(
        invoice.shippingInfo?.toObject?.() ||
        invoice.shippingInfo ||
        {}
      ),

      deliveredAt: new Date()
    }

    addTimeline(
      invoice,
      "delivered",
      "Invoice marked as delivered."
    )

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    errorResponse(
      res,
      error,
      "MARK DELIVERED ERROR"
    )
  }
}

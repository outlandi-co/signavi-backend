import crypto from "crypto"
import sgMail from "@sendgrid/mail"
import { SquareClient, SquareEnvironment } from "square"
import Invoice from "../models/Invoice.js"
import Notification from "../models/Notification.js"

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

const BACKEND_URL =
  process.env.BACKEND_URL ||
  "https://signavi-backend.onrender.com"

const LOGO_URL =
  `${CLIENT_URL.replace(/\/$/, "")}/signavi-logo.png`

const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "admin@signavistudio.store"

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ||
  "admin@signavistudio.store"

const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: SquareEnvironment.Production
})

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

const emitAdminNotification = (req, notification) => {
  req.app.get("io")?.emit("adminNotification", notification)
}

const createSquarePaymentLinkForInvoice = async (invoice) => {
  if (invoice.paymentUrl) return invoice.paymentUrl

  const amount = Math.round(Number(invoice.total || 0) * 100)

  const response = await squareClient.checkout.paymentLinks.create({
    idempotencyKey: crypto.randomUUID(),
    quickPay: {
      name: `Invoice ${invoice.invoiceNumber}`,
      priceMoney: {
        amount: BigInt(amount),
        currency: "USD"
      },
      locationId: process.env.SQUARE_LOCATION_ID
    },
    checkoutOptions: {
      redirectUrl: `${CLIENT_URL}/invoice/${invoice._id}`
    }
  })

  const paymentLink = response.paymentLink

  invoice.paymentUrl = paymentLink.url
  invoice.squareCheckoutId = paymentLink.id || ""
  invoice.squarePaymentLinkId = paymentLink.id || ""
  invoice.status = "payment_required"

  await invoice.save()

  return invoice.paymentUrl
}

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

    await invoice.save()

    res.status(201).json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("❌ CREATE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 })

    res.json({
      success: true,
      data: invoices
    })
  } catch (error) {
    console.error("❌ GET INVOICES ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

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
    console.error("❌ GET INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const createInvoicePaymentLink = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const paymentUrl = await createSquarePaymentLinkForInvoice(invoice)

    res.json({
      success: true,
      paymentUrl,
      data: invoice
    })
  } catch (error) {
    console.error("❌ CREATE PAYMENT LINK ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const invoiceUrl = await createSquarePaymentLinkForInvoice(invoice)
    const proofUrl = `${CLIENT_URL}/proof/${invoice._id}`

    await sgMail.send({
      to: invoice.customerEmail,
      from: FROM_EMAIL,
      subject: `Invoice ${invoice.invoiceNumber} from SignaVi Studio`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;border:1px solid #ddd;padding:30px;">
          <div style="text-align:center;border-bottom:2px solid #111;padding-bottom:20px;">
            <img src="${LOGO_URL}" style="width:140px;" />
            <h1>SIGNAVI STUDIO</h1>
            <p>Signature | Vision | Veteran Owned</p>
          </div>

          <div style="padding:24px 0;">
            <p>Hi ${invoice.customerName},</p>
            <p>Your final design proofs and invoice are ready.</p>

            <div style="margin:24px 0;">
              <a href="${proofUrl}" style="background:#111;color:#fff;padding:14px 18px;border-radius:8px;text-decoration:none;margin-right:10px;display:inline-block;">
                Review Final Proofs
              </a>

              <a href="${invoiceUrl}" style="background:#0f766e;color:#fff;padding:14px 18px;border-radius:8px;text-decoration:none;display:inline-block;">
                Pay Invoice
              </a>
            </div>

            <h2>Total: $${Number(invoice.total || 0).toFixed(2)}</h2>
          </div>
        </div>
      `
    })

    invoice.status =
      invoice.finalProof?.files?.length ||
      invoice.finalProof?.imageUrl
        ? "proof_uploaded"
        : "payment_required"

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("❌ SEND EMAIL ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    )

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("❌ UPDATE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const deleteInvoice = async (req, res) => {
  try {
    await Invoice.findByIdAndDelete(req.params.id)

    res.json({
      success: true
    })
  } catch (error) {
    console.error("❌ DELETE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const uploadFinalProof = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const uploadedFiles = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : []

    if (!uploadedFiles.length) {
      return res.status(400).json({
        success: false,
        message: "At least one final proof file is required"
      })
    }

    const proofFiles = uploadedFiles.map((file) => {
      const url =
        `${BACKEND_URL.replace(/\/$/, "")}/uploads/proofs/${file.filename}`

      return {
        url,
        fileName: file.originalname,
        mimeType: file.mimetype
      }
    })

    invoice.status = "proof_uploaded"

    invoice.finalProof = {
      imageUrl: proofFiles[0]?.url || "",
      fileName: proofFiles[0]?.fileName || "",
      files: proofFiles,
      approved: false,
      approvedAt: null,
      approvalName: "",
      approvalEmail: ""
    }

    await invoice.save()

    res.json({
      success: true,
      filesUploaded: proofFiles.length,
      data: invoice
    })
  } catch (error) {
    console.error("❌ UPLOAD FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: error?.message || "Final proof upload failed"
    })
  }
}

export const approveFinalProof = async (req, res) => {
  try {
    const {
      approvalName = "",
      approvalEmail = ""
    } = req.body

    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      {
        status: "proof_approved",
        "finalProof.approved": true,
        "finalProof.approvedAt": new Date(),
        "finalProof.approvalName": approvalName,
        "finalProof.approvalEmail": approvalEmail
      },
      { new: true }
    )

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const notification = await Notification.create({
      userEmail: ADMIN_EMAIL,
      title: "Final Proof Approved",
      text: `${invoice.customerName} approved final proofs for ${invoice.invoiceNumber}.`,
      type: "proof",
      invoiceId: invoice._id,
      link: "/admin/invoices",
      read: false,
      archived: false
    })

    emitAdminNotification(req, notification)

    res.json({
      success: true,
      data: invoice,
      notification
    })
  } catch (error) {
    console.error("❌ APPROVE FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const markInvoicePaid = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    invoice.paymentStatus = "paid"
    invoice.status = "ready_for_production"
    invoice.paidAt = new Date()

    await invoice.save()

    const notification = await Notification.create({
      userEmail: ADMIN_EMAIL,
      title: "Payment Received",
      text: `${invoice.customerName} paid ${invoice.invoiceNumber} for $${Number(invoice.total || 0).toFixed(2)}.`,
      type: "payment",
      invoiceId: invoice._id,
      link: "/admin/invoices",
      read: false,
      archived: false
    })

    emitAdminNotification(req, notification)

    res.json({
      success: true,
      data: invoice,
      notification
    })
  } catch (error) {
    console.error("❌ MARK PAID ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

export const startProduction = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    if (invoice.paymentStatus !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Invoice must be paid first"
      })
    }

    invoice.status = "production"

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("❌ START PRODUCTION ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
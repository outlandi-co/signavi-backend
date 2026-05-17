import crypto from "crypto"
import sgMail from "@sendgrid/mail"
import { Client, Environment } from "square"
import Invoice from "../models/Invoice.js"

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "admin@signavistudio.store"

if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
}

const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment:
    process.env.SQUARE_ENVIRONMENT === "production"
      ? Environment.Production
      : Environment.Sandbox
})

const getSquareLocationId = () => {
  return (
    process.env.SQUARE_LOCATION_ID ||
    process.env.SQUARE_SANDBOX_LOCATION_ID
  )
}

const createSquarePaymentLinkForInvoice = async (invoice) => {
  if (invoice.paymentUrl) {
    return invoice.paymentUrl
  }

  if (!process.env.SQUARE_ACCESS_TOKEN) {
    throw new Error("Missing SQUARE_ACCESS_TOKEN")
  }

  const locationId = getSquareLocationId()

  if (!locationId) {
    throw new Error("Missing SQUARE_LOCATION_ID")
  }

  const amount = Math.round(Number(invoice.total || 0) * 100)

  if (!amount || amount <= 0) {
    throw new Error("Invoice total must be greater than 0")
  }

  const response =
    await squareClient.checkoutApi.createPaymentLink({
      idempotencyKey: crypto.randomUUID(),

      quickPay: {
        name: `Invoice ${invoice.invoiceNumber}`,
        priceMoney: {
          amount: BigInt(amount),
          currency: "USD"
        },
        locationId
      },

      checkoutOptions: {
        redirectUrl: `${CLIENT_URL}/invoice/${invoice._id}`
      }
    })

  const paymentLink = response.result.paymentLink

  if (!paymentLink?.url) {
    throw new Error("Square did not return a payment URL")
  }

  invoice.paymentUrl = paymentLink.url
  invoice.squareCheckoutId = paymentLink.id || ""
  invoice.squarePaymentLinkId = paymentLink.id || ""
  invoice.status = "payment_required"

  await invoice.save()

  return invoice.paymentUrl
}

/* ================= CREATE INVOICE ================= */

export const createInvoice = async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      items = [],
      shipping = 0,
      notes = ""
    } = req.body

    if (!customerName || !customerEmail) {
      return res.status(400).json({
        success: false,
        message: "Customer name and email are required"
      })
    }

    if (!items.length) {
      return res.status(400).json({
        success: false,
        message: "At least one invoice item is required"
      })
    }

    const cleanedItems = items.map((item) => ({
      name: String(item.name || "").trim(),
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0)
    }))

    const invoice = new Invoice({
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail)
        .trim()
        .toLowerCase(),
      items: cleanedItems,
      shipping: Number(shipping || 0),
      notes,
      paymentStatus: "unpaid",
      status: "draft"
    })

    await invoice.save()

    console.log("✅ INVOICE CREATED:", invoice._id)

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

/* ================= CREATE PAYMENT LINK ================= */

export const createInvoicePaymentLink = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const paymentUrl =
      await createSquarePaymentLinkForInvoice(invoice)

    console.log("💳 PAYMENT LINK CREATED:", paymentUrl)

    res.json({
      success: true,
      message: "Invoice payment link created",
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

/* ================= SEND INVOICE EMAIL ================= */

export const sendInvoiceEmail = async (req, res) => {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "Missing SENDGRID_API_KEY"
      })
    }

    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const invoiceUrl =
      await createSquarePaymentLinkForInvoice(invoice)

    await sgMail.send({
      to: invoice.customerEmail,
      from: FROM_EMAIL,

      subject:
        `Invoice ${invoice.invoiceNumber} from SignaVi Studio`,

      html: `
        <div style="
          font-family:Arial,sans-serif;
          color:#111;
          line-height:1.5;
        ">

          <h2>
            SignaVi Studio Invoice
          </h2>

          <p>
            Hi ${invoice.customerName},
          </p>

          <p>
            Your invoice is ready for payment.
          </p>

          <p>
            <strong>Invoice:</strong>
            ${invoice.invoiceNumber}
          </p>

          <p>
            <strong>Subtotal:</strong>
            $${Number(invoice.subtotal || 0).toFixed(2)}
          </p>

          <p>
            <strong>Tax:</strong>
            $${Number(invoice.tax || 0).toFixed(2)}
          </p>

          <p>
            <strong>Shipping:</strong>
            $${Number(invoice.shipping || 0).toFixed(2)}
          </p>

          <h3>
            Total:
            $${Number(invoice.total || 0).toFixed(2)}
          </h3>

          <p>
            <a
              href="${invoiceUrl}"
              style="
                background:#111;
                color:#fff;
                padding:12px 18px;
                text-decoration:none;
                border-radius:8px;
                display:inline-block;
              "
            >
              Pay Invoice
            </a>
          </p>

          <p>
            Or copy and paste this link:
            <br />
            ${invoiceUrl}
          </p>

          <p>
            Thank you,
            <br />
            SignaVi Studio
          </p>

        </div>
      `
    })

    invoice.status = "payment_required"
    await invoice.save()

    console.log("📧 INVOICE EMAIL SENT:", invoice.customerEmail)

    res.json({
      success: true,
      message: "Invoice email sent successfully",
      paymentUrl: invoiceUrl,
      data: invoice
    })

  } catch (error) {
    console.error("❌ SEND INVOICE EMAIL ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= GET ALL INVOICES ================= */

export const getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .sort({ createdAt: -1 })

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

/* ================= GET INVOICE BY ID ================= */

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

/* ================= UPDATE INVOICE ================= */

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const allowedFields = [
      "customerName",
      "customerEmail",
      "items",
      "shipping",
      "notes",
      "status",
      "paymentStatus"
    ]

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        invoice[field] = req.body[field]
      }
    })

    if (invoice.paymentStatus === "paid") {
      invoice.paidAt = invoice.paidAt || new Date()
    }

    await invoice.save()

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

/* ================= DELETE INVOICE ================= */

export const deleteInvoice = async (req, res) => {
  try {
    const invoice =
      await Invoice.findByIdAndDelete(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    res.json({
      success: true,
      message: "Invoice deleted successfully"
    })

  } catch (error) {
    console.error("❌ DELETE INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= UPLOAD FINAL PROOF ================= */

export const uploadFinalProof = async (req, res) => {
  try {
    const { imageUrl, fileName } = req.body

    const invoice =
      await Invoice.findByIdAndUpdate(
        req.params.id,
        {
          status: "proof_uploaded",

          finalProof: {
            imageUrl,
            fileName,
            approved: false,
            approvedAt: null,
            approvalName: "",
            approvalEmail: ""
          }
        },
        {
          new: true,
          runValidators: true
        }
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
    console.error("❌ UPLOAD FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= APPROVE FINAL PROOF ================= */

export const approveFinalProof = async (req, res) => {
  try {
    const {
      approvalName = "",
      approvalEmail = ""
    } = req.body

    const invoice =
      await Invoice.findByIdAndUpdate(
        req.params.id,
        {
          status: "proof_approved",

          "finalProof.approved": true,
          "finalProof.approvedAt": new Date(),

          "finalProof.approvalName": approvalName,

          "finalProof.approvalEmail": approvalEmail
        },
        {
          new: true,
          runValidators: true
        }
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
    console.error("❌ APPROVE FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= MARK PAID ================= */

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

    res.json({
      success: true,
      data: invoice
    })

  } catch (error) {
    console.error("❌ MARK INVOICE PAID ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= START PRODUCTION ================= */

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
        message:
          "Invoice must be paid before production starts"
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
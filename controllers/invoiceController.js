import sgMail from "@sendgrid/mail"
import Invoice from "../models/Invoice.js"

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://signavistudio.store"

const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL ||
  process.env.EMAIL_FROM ||
  "admin@signavistudio.store"

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

    const hasInvalidItem = cleanedItems.some((item) => {
      return !item.name || item.quantity <= 0 || item.price < 0
    })

    if (hasInvalidItem) {
      return res.status(400).json({
        success: false,
        message: "Each invoice item needs a valid name, quantity, and price"
      })
    }

    const invoice = new Invoice({
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim().toLowerCase(),
      items: cleanedItems,
      shipping: Number(shipping || 0),
      notes,
      paymentStatus: "unpaid",
      status: "draft"
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

/* ================= SEND INVOICE EMAIL ================= */

export const sendInvoiceEmail = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found"
      })
    }

    const invoiceUrl =
      `${CLIENT_URL}/invoice/${invoice._id}`

    const itemRows = invoice.items
      .map((item) => {
        const lineTotal =
          Number(item.quantity || 0) *
          Number(item.price || 0)

        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #ddd;">
              ${item.name}
            </td>

            <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">
              ${item.quantity}
            </td>

            <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">
              $${Number(item.price || 0).toFixed(2)}
            </td>

            <td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">
              $${lineTotal.toFixed(2)}
            </td>
          </tr>
        `
      })
      .join("")

    await sgMail.send({
      to: invoice.customerEmail,
      from: FROM_EMAIL,
      subject: `Invoice ${invoice.invoiceNumber} from SignaVi Studio`,

      html: `
        <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">

          <h2>SignaVi Studio Invoice</h2>

          <p>
            Hi ${invoice.customerName},
          </p>

          <p>
            Your invoice is ready for review.
          </p>

          <p>
            <strong>Invoice:</strong>
            ${invoice.invoiceNumber}
          </p>

          <table style="border-collapse:collapse;width:100%;max-width:700px;">

            <thead>
              <tr>
                <th style="padding:8px;border-bottom:2px solid #111;text-align:left;">
                  Item
                </th>

                <th style="padding:8px;border-bottom:2px solid #111;text-align:center;">
                  Qty
                </th>

                <th style="padding:8px;border-bottom:2px solid #111;text-align:right;">
                  Price
                </th>

                <th style="padding:8px;border-bottom:2px solid #111;text-align:right;">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              ${itemRows}
            </tbody>

          </table>

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
              View Invoice
            </a>
          </p>

          <p>
            Thank you,
            <br />
            SignaVi Studio
          </p>

        </div>
      `
    })

    if (invoice.status === "draft") {
      invoice.status = "payment_required"
      await invoice.save()
    }

    res.json({
      success: true,
      message: "Invoice email sent successfully",
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
    console.error("GET INVOICES ERROR:", error)

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
    console.error("GET INVOICE ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= UPDATE INVOICE ================= */

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
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
    console.error("UPDATE INVOICE ERROR:", error)

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
    console.error("DELETE INVOICE ERROR:", error)

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

    const invoice = await Invoice.findByIdAndUpdate(
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
    console.error("UPLOAD FINAL PROOF ERROR:", error)

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

    const invoice = await Invoice.findByIdAndUpdate(
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
    console.error("APPROVE FINAL PROOF ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= MARK PAID ================= */

export const markInvoicePaid = async (req, res) => {
  try {
    const invoice =
      await Invoice.findById(req.params.id)

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
    console.error("MARK INVOICE PAID ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

/* ================= START PRODUCTION ================= */

export const startProduction = async (req, res) => {
  try {
    const invoice =
      await Invoice.findById(req.params.id)

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

    if (!invoice.finalProof?.approved) {
      return res.status(400).json({
        success: false,
        message:
          "Final proof must be approved before production starts"
      })
    }

    invoice.status = "production"

    await invoice.save()

    res.json({
      success: true,
      data: invoice
    })
  } catch (error) {
    console.error("START PRODUCTION ERROR:", error)

    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}
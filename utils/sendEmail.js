import nodemailer from "nodemailer"
import fs from "fs"
import path from "path"
import PDFDocument from "pdfkit"

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

const FRONTEND_URL = "http://localhost:5173"

/* ================= ENSURE UPLOADS ================= */
const ensureUploadDir = () => {
  const uploadDir = path.resolve("uploads")

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true })
  }

  return uploadDir
}

/* ================= PDF ================= */
const generateInvoicePDF = (order = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const uploadDir = ensureUploadDir()

      const orderId = order?._id?.toString() || Date.now()
      const filePath = path.join(uploadDir, `invoice-${orderId}.pdf`)

      const doc = new PDFDocument({ margin: 40 })
      const stream = fs.createWriteStream(filePath)

      doc.pipe(stream)

      doc.fontSize(20).text("Signavi Invoice", { align: "center" })
      doc.moveDown()

      doc.text(`Order ID: ${orderId}`)
      doc.text(`Customer: ${order.customerName || "N/A"}`)
      doc.moveDown()

      const items = order.items || []

      if (!items.length) {
        doc.text("No item details provided")
      } else {
        items.forEach(item => {
          const qty = Number(item.quantity) || 1
          const price = Number(item.price) || 0

          doc.text(`${item.name || "Item"} | Qty: ${qty} | $${price.toFixed(2)}`)
        })
      }

      doc.moveDown()

      const total =
        Number(order.total) ||
        Number(order.finalPrice) ||
        0

      doc.text(`Total: $${total.toFixed(2)}`, { align: "right" })

      doc.end()

      stream.on("finish", () => resolve(filePath))
      stream.on("error", reject)

    } catch (err) {
      reject(err)
    }
  })
}

/* ================= TABLE ================= */
const buildInvoiceTable = (items = []) => {
  if (!items.length) {
    return `<p style="text-align:center;">No item details provided</p>`
  }

  return `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;color:white;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:2px solid #666;">Item</th>
          <th style="text-align:center;padding:8px;border-bottom:2px solid #666;">Qty</th>
          <th style="text-align:right;padding:8px;border-bottom:2px solid #666;">Price</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => {
          const qty = Number(item.quantity) || 1
          const price = Number(item.price) || 0

          return `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #444;">
                ${item.name || "Item"}
              </td>
              <td style="padding:8px;border-bottom:1px solid #444;text-align:center;">
                ${qty}
              </td>
              <td style="padding:8px;border-bottom:1px solid #444;text-align:right;">
                $${price.toFixed(2)}
              </td>
            </tr>
          `
        }).join("")}
      </tbody>
    </table>
  `
}

/* ================= TEMPLATE ================= */
const buildEmailTemplate = ({
  status,
  orderId,
  total,
  checkoutUrl,
  items
}) => {

  const fallbackLink = `${FRONTEND_URL}/checkout/${orderId}`
  const paymentLink = checkoutUrl || fallbackLink

  const invoiceTable = buildInvoiceTable(items)

  let actionSection = ""
  let statusSection = ""

  /* 🔥 ALWAYS SHOW BUTTON WHEN PAYMENT REQUIRED */
  if (status === "payment_required") {
    actionSection = `
      <div style="text-align:center;margin-bottom:25px;">
        <a href="${paymentLink}" target="_blank"
          style="
            display:inline-block;
            padding:18px 32px;
            background:#22c55e;
            color:white;
            border-radius:10px;
            text-decoration:none;
            font-size:18px;
            font-weight:bold;
          ">
          💳 Pay Now
        </a>
      </div>
    `

    statusSection = `
      <h2 style="text-align:center;color:#f59e0b;">
        Invoice Ready: $${Number(total || 0).toFixed(2)}
      </h2>
      <p style="text-align:center;">
        Please review your invoice below and complete payment above.
      </p>
    `
  }

  if (status === "paid") {
    statusSection = `
      <h2 style="text-align:center;color:#10b981;">
        Payment Received: $${Number(total || 0).toFixed(2)}
      </h2>
      <p style="text-align:center;">
        Your order is now in production.
      </p>
    `
  }

  return `
    <div style="background:#020617;padding:25px;color:white;font-family:Arial;">
      
      ${actionSection}

      <h1 style="text-align:center;">
        ${(status || "UPDATE").toUpperCase()}
      </h1>

      <p style="text-align:center;">Order: ${orderId}</p>

      ${statusSection}

      ${invoiceTable}

      <h3 style="text-align:right;margin-top:20px;">
        Total: $${Number(total || 0).toFixed(2)}
      </h3>

    </div>
  `
}

/* ================= SEND ================= */
export const sendOrderStatusEmail = async (
  email,
  status,
  orderId,
  orderData = {}
) => {
  try {
    if (!email) return

    console.log("📧 Sending email to:", email)

    const safeOrder = {
      _id: orderId,
      customerName: orderData?.customerName || "Customer",

      items: orderData?.items?.length
        ? orderData.items
        : [
            {
              name: orderData?.printType || "Custom Order",
              quantity: Number(orderData?.quantity) || 1,
              price:
                Number(orderData?.price) ||
                Number(orderData?.finalPrice) ||
                0
            }
          ],

      total:
        Number(orderData?.total) ||
        Number(orderData?.finalPrice) ||
        0
    }

    let attachments = []

    if (["paid", "payment_required"].includes(status)) {
      const filePath = await generateInvoicePDF(safeOrder)

      attachments.push({
        filename: `invoice-${orderId}.pdf`,
        path: filePath
      })
    }

    await transporter.sendMail({
      from: `"Signavi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order ${status}`,
      html: buildEmailTemplate({
        status,
        orderId,
        total: safeOrder.total,
        checkoutUrl: orderData?.checkoutUrl,
        items: safeOrder.items
      }),
      attachments
    })

    console.log("✅ Email sent:", email)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}
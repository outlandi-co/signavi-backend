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

          doc.text(
            `${item.name || "Item"} | Qty: ${qty} | $${price.toFixed(2)}`
          )
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

/* ================= TEMPLATE ================= */
const buildEmailTemplate = ({
  status,
  orderId,
  total,
  checkoutUrl
}) => {

  const fallbackLink = `${FRONTEND_URL}/checkout/${orderId}`
  const paymentLink = checkoutUrl || fallbackLink

  let actionSection = ""
  let paidSection = ""

  /* 💳 PAYMENT BUTTON (ONLY WHEN NEEDED) */
  if (status === "payment_required") {
    actionSection = `
      <div style="text-align:center;margin-bottom:20px;">
        <a href="${paymentLink}"
          target="_blank"
          style="
            display:inline-block;
            padding:16px 28px;
            background:#16a34a;
            color:white;
            border-radius:8px;
            text-decoration:none;
            font-weight:bold;
            font-size:16px;
          ">
          💳 Pay Now
        </a>
      </div>
    `
  }

  /* 🧾 PAYMENT REQUIRED */
  if (status === "payment_required") {
    paidSection = `
      <h2 style="text-align:center;color:#f59e0b;">
        Invoice Ready: $${Number(total || 0).toFixed(2)}
      </h2>
      <p style="text-align:center;">
        Please review your invoice and complete payment above.
      </p>
    `
  }

  /* ✅ PAID */
  if (status === "paid") {
    paidSection = `
      <h2 style="text-align:center;color:#10b981;">
        Payment Received: $${Number(total || 0).toFixed(2)}
      </h2>
      <p style="text-align:center;">
        Thank you! Your order is now in production.
      </p>
      <p style="text-align:center;">
        Your invoice is attached for your records.
      </p>
    `
  }

  return `
    <div style="background:#020617;padding:25px;color:white;font-family:Arial;">

      ${actionSection}

      <h1 style="text-align:center;margin-top:10px;">
        ${(status || "UPDATE").toUpperCase()}
      </h1>

      <p style="text-align:center;">Order: ${orderId}</p>

      ${paidSection}

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
    if (!email) {
      console.log("⚠️ No email provided")
      return
    }

    console.log("📧 Sending email to:", email)

    const safeOrder = {
      _id: orderId,
      customerName: orderData?.customerName || "Customer",
      items: orderData?.items || [],
      total:
        Number(orderData?.total) ||
        Number(orderData?.finalPrice) ||
        0
    }

    let attachments = []

    /* 🔥 ATTACH INVOICE BEFORE + AFTER PAYMENT */
    if (status === "paid" || status === "payment_required") {
      try {
        const filePath = await generateInvoicePDF(safeOrder)

        attachments.push({
          filename: `invoice-${orderId}.pdf`,
          path: filePath
        })

        console.log("🧾 Invoice attached:", filePath)

      } catch (err) {
        console.error("❌ INVOICE ERROR:", err)
      }
    }

    await transporter.sendMail({
      from: `"Signavi" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order ${status}`,
      html: buildEmailTemplate({
        status,
        orderId,
        total: safeOrder.total,
        checkoutUrl: orderData?.checkoutUrl
      }),
      attachments
    })

    console.log("✅ Email sent:", email)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}
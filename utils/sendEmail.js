import nodemailer from "nodemailer"
import fs from "fs"
import path from "path"
import PDFDocument from "pdfkit"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* 🔥 FRONTEND URL (NOT BACKEND) */
const FRONTEND_URL = "http://localhost:5173"

/* ================= PDF ================= */
const generateInvoicePDF = (order = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const filePath = path.join("uploads", `invoice-${order._id}.pdf`)
      const doc = new PDFDocument()

      const stream = fs.createWriteStream(filePath)
      doc.pipe(stream)

      doc.fontSize(20).text("Signavi Invoice", { align: "center" })
      doc.moveDown()

      doc.text(`Order ID: ${order._id || "N/A"}`)
      doc.text(`Customer: ${order.customerName || "N/A"}`)
      doc.moveDown()

      const items = order.items || []

     if (!items.length) {
  doc.text("No item details provided")
} else {
  items.forEach(item => {
    doc.text(
      `${item.name || "Item"} | Qty: ${item.quantity || 0} | $${item.price || 0}`
    )
  })
}

      doc.moveDown()

      const total = order.total || order.finalPrice || 0
      doc.text(`Total: $${total}`, { align: "right" })

      doc.end()

      stream.on("finish", () => resolve(filePath))
      stream.on("error", reject)

    } catch (err) {
      reject(err)
    }
  })
}

/* ================= TEMPLATE ================= */
const buildEmailTemplate = ({ status, orderId, total }) => {

  /* 🔥 FIXED LINK */
  const paymentLink = `${FRONTEND_URL}/checkout/${orderId}`

  let actionSection = ""

  if (status === "artwork_sent" || status === "approved") {
    actionSection = `
      <div style="margin:30px 0;text-align:center;">
        <a href="${paymentLink}"
          target="_blank"
          style="padding:14px 24px;background:black;color:white;border-radius:6px;text-decoration:none;">
          💳 Complete Purchase
        </a>
      </div>
    `
  }

  let paidSection = ""
  if (status === "paid") {
    paidSection = `
      <h2 style="text-align:center;color:#10b981;">
        Payment Received: $${Number(total || 0).toFixed(2)}
      </h2>
      <p style="text-align:center;">
        Your invoice is attached below.
      </p>
    `
  }

  return `
    <div style="background:#020617;padding:30px;color:white;font-family:Arial;">
      <h1 style="text-align:center;">${(status || "UPDATE").toUpperCase()}</h1>
      <p style="text-align:center;">Order: ${orderId}</p>
      ${actionSection}
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
    if (!email) return

    console.log("📧 Sending email to:", email)

    const safeOrder = {
      _id: orderId,
      customerName: orderData?.customerName || "Customer",
      items: orderData?.items || [],
      total: orderData?.total || orderData?.finalPrice || 0
    }

    let attachments = []

    if (status === "paid") {
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
        total: safeOrder.total
      }),
      attachments
    })

    console.log("✅ Email sent:", email)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}
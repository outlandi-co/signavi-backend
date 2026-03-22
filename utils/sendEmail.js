import nodemailer from "nodemailer"
import fs from "fs"
import PDFDocument from "pdfkit"
import path from "path"
import { getTrackingLink } from "./tracking.js"

/* ================= EMAIL ================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ================= ORDER STATUS EMAIL ================= */

export const sendOrderStatusEmail = async (
  email,
  status,
  orderId,
  invoicePath = null,
  trackingNumber = null
) => {
  try {

    let trackingHtml = ""

    if (trackingNumber) {
      const link = getTrackingLink(trackingNumber)

      trackingHtml = `
        <p><b>Tracking Number:</b> ${trackingNumber}</p>
        <p><a href="${link}" target="_blank">📦 Track Package</a></p>
      `
    }

    const mailOptions = {
      from: `"Signavi Store" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `📦 Order Update - ${orderId}`,
      html: `
        <h2>Order Update</h2>
        <p>Order <b>${orderId}</b> is now:</p>
        <h3>${status.toUpperCase()}</h3>
        ${trackingHtml}
      `
    }

    if (invoicePath && fs.existsSync(invoicePath)) {
      mailOptions.attachments = [
        { filename: "invoice.pdf", path: invoicePath }
      ]
    }

    await transporter.sendMail(mailOptions)

    console.log("📧 Status Email sent:", email)

  } catch (err) {
    console.error("❌ STATUS EMAIL ERROR:", err)
  }
}

/* ================= ARTWORK EMAIL (NEW 🔥) ================= */

export const sendArtworkEmail = async (order) => {
  try {
    if (!order) {
      throw new Error("Order missing")
    }

    if (!order.artwork) {
      throw new Error("No artwork found")
    }

    const filePath = path.resolve("uploads", order.artwork)

    console.log("📁 Artwork path:", filePath)

    if (!fs.existsSync(filePath)) {
      throw new Error("Artwork file missing on server")
    }

await transporter.sendMail({
  from: `"Signavi Store" <${process.env.EMAIL_USER}>`,
  to: [
    process.env.EMAIL_USER,
    order.email
  ].filter(Boolean),
  subject: `🎨 Artwork - Order ${order._id}`,
  html: `
    <h2>Artwork Ready</h2>
    <p><b>Order:</b> ${order._id}</p>
    <p><b>Customer:</b> ${order.customerName}</p>
  `,
  attachments: [
    {
      filename: order.artwork,
      path: filePath
    }
  ]
})

    console.log("📧 Artwork Email sent")

  } catch (err) {
    console.error("❌ ARTWORK EMAIL ERROR:", err)
    throw err // 🔥 important so route can respond correctly
  }
}

/* ================= INVOICE ================= */

export const generateInvoice = (order) => {

  const filePath = path.resolve(`invoices/invoice-${order._id}.pdf`)

  if (!fs.existsSync("invoices")) {
    fs.mkdirSync("invoices")
  }

  const doc = new PDFDocument()

  doc.pipe(fs.createWriteStream(filePath))

  doc.fontSize(20).text("SIGNAVI INVOICE", { align: "center" })
  doc.moveDown()

  doc.text(`Order ID: ${order._id}`)
  doc.text(`Customer: ${order.customerName}`)
  doc.text(`Email: ${order.email}`)

  doc.moveDown()

  order.items?.forEach(item => {
    doc.text(`${item.name} x${item.quantity} - $${item.price}`)
  })

  doc.moveDown()
  doc.text(`Total: $${order.total}`)

  doc.end()

  return filePath
}
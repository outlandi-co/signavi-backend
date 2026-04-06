import nodemailer from "nodemailer"
import QRCode from "qrcode"
import { generateInvoice } from "./invoiceGenerator.js"

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ================= ORDER EMAIL ================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  orderId,
  order
) => {
  try {
    if (!to) {
      console.log("⚠️ No email provided")
      return
    }

    console.log("📧 Sending email:", status)

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "http://localhost:5173"

    /* 🔥 USE ORDER PAGE (BETTER UX) */
    const trackingPage = `${FRONTEND_URL}/order/${orderId}`

    const qrCode = await QRCode.toDataURL(trackingPage)

    /* ================= TEMPLATE ================= */
    const wrap = (content) => `
      <div style="font-family: Arial; padding: 20px; max-width:600px;">
        <h2>Signavi Studio</h2>

        ${content}

        <hr style="margin-top:30px;" />

        <p style="font-size:12px;color:#555;">
          Track your order:
        </p>

        <a href="${trackingPage}">
          ${trackingPage}
        </a>

        <div style="margin-top:20px;">
          <img src="${qrCode}" width="140" />
        </div>
      </div>
    `

    let subject = ""
    let html = ""

    switch (status) {
      case "paid":
        subject = "✅ Payment Received"
        html = wrap(`<p>Your payment has been received.</p>`)
        break

      case "shipping": // 🔥 FIXED (was shipped mismatch)
        subject = "🚚 Order Shipped"
        html = wrap(`<p>Your order is on the way.</p>`)
        break

      case "delivered":
        subject = "📦 Delivered"
        html = wrap(`<p>Your order has been delivered.</p>`)
        break

      default:
        subject = "📦 Order Update"
        html = wrap(`<p>Status: ${status}</p>`)
    }

    /* ================= INVOICE ================= */
    let attachments = []

    if (["paid", "shipping", "delivered"].includes(status)) {
      try {
        const filePath = await generateInvoice(order)

        attachments.push({
          filename: `invoice-${orderId}.pdf`,
          path: filePath
        })

        console.log("📄 Invoice attached")

      } catch (err) {
        console.error("❌ Invoice error:", err.message)
      }
    }

    /* ================= SEND ================= */
    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments
    })

    console.log("✅ Email sent:", info.response)

  } catch (error) {
    console.error("❌ ORDER EMAIL FAILED:", error.message)
  }
}

/* ================= QUOTE EMAIL ================= */
export const sendQuoteEmail = async (to, quote) => {
  try {
    if (!to) return

    console.log("📧 Sending quote email:", quote._id)

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "http://localhost:5173"

    const paymentLink = `${FRONTEND_URL}/checkout/${quote._id}`

    const html = `
      <div style="font-family: Arial; padding: 20px; max-width:600px;">
        <h2>Signavi Studio</h2>

        <p>Hello ${quote.customerName || "Customer"},</p>

        <p>Your quote is ready.</p>

        <p><strong>Quote ID:</strong> ${quote._id}</p>
        <h3>$${(quote.price || 0).toFixed(2)}</h3>

        <a href="${paymentLink}"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#22c55e;
            color:#000;
            text-decoration:none;
            border-radius:6px;
            margin-top:10px;
          ">
          💳 Pay Now
        </a>

        <p style="margin-top:20px;">
          Thank you 🙏
        </p>
      </div>
    `

    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject: "💰 Your Quote is Ready",
      html
    })

    console.log("✅ Quote email sent:", info.response)

  } catch (error) {
    console.error("❌ QUOTE EMAIL FAILED:", error.message)
  }
}
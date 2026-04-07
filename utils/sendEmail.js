import nodemailer from "nodemailer"
import QRCode from "qrcode"
import { generateInvoice } from "./invoiceGenerator.js"

/* ================= OPTIONAL AXIOS ================= */
let axios = null
try {
  const mod = await import("axios")
  axios = mod.default
} catch (err) {
  console.warn("⚠️ Axios not installed — payment links will be disabled")
}

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* 🔥 VERIFY CONNECTION */
transporter.verify((err, success) => {
  if (err) {
    console.error("❌ EMAIL SERVER ERROR:", err)
  } else {
    console.log("✅ EMAIL SERVER READY")
  }
})

/* ================= GENERIC ================= */
export const sendNotificationEmail = async (to, subject, message) => {
  try {
    const target = to || process.env.EMAIL_USER

    console.log("📧 Sending notification to:", target)

    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject,
      html: `
        <div style="font-family: Arial; padding:20px;">
          <h2>Signavi Studio</h2>
          <p>${message}</p>
        </div>
      `
    })

    console.log("✅ Notification email sent:", info.response)

  } catch (err) {
    console.error("❌ Notification email failed:", err)
  }
}

/* ================= ORDER EMAIL ================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  orderId,
  order
) => {
  try {
    const target = to || process.env.EMAIL_USER // 🔥 FORCE FALLBACK

    console.log("📧 ORDER EMAIL TARGET:", target)

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "http://localhost:5173"

    const trackingPage = `${FRONTEND_URL}/order/${orderId}`
    const qrCode = await QRCode.toDataURL(trackingPage)

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

      case "payment_required":
        subject = "💳 Payment Required"

        let paymentLink = `${FRONTEND_URL}/checkout/${orderId}`

        if (axios) {
          try {
            const res = await axios.post(
              `http://localhost:5050/api/checkout/create-checkout/${orderId}`
            )
            paymentLink = res.data.url
            console.log("💳 Stripe link created:", paymentLink)
          } catch (err) {
            console.error("❌ Stripe link error:", err.message)
          }
        }

        html = wrap(`
          <p>Hello ${order.customerName || "Customer"},</p>

          <p>Your order is ready for payment.</p>

          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Total:</strong> $${(order.finalPrice || order.price || 0).toFixed(2)}</p>

          <a href="${paymentLink}"
            style="
              display:inline-block;
              padding:12px 20px;
              background:#06b6d4;
              color:white;
              text-decoration:none;
              border-radius:6px;
              margin-top:15px;
            ">
            💳 Pay Now
          </a>
        `)
        break

      case "paid":
        subject = "✅ Payment Received"
        html = wrap(`<p>Your payment has been received.</p>`)
        break

      case "shipping":
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

    let attachments = []

    if (["paid", "shipping", "delivered"].includes(status)) {
      try {
        const filePath = await generateInvoice(order)

        attachments.push({
          filename: `invoice-${orderId}.pdf`,
          path: filePath
        })
      } catch (err) {
        console.error("❌ Invoice error:", err.message)
      }
    }

    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject,
      html,
      attachments
    })

    console.log("✅ ORDER EMAIL SENT:", info.response)

  } catch (error) {
    console.error("❌ ORDER EMAIL FAILED:", error)
  }
}

/* ================= QUOTE EMAIL ================= */
export const sendQuoteEmail = async (to, quote) => {
  try {
    const target = to || process.env.EMAIL_USER

    console.log("📧 QUOTE EMAIL TARGET:", target)

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "http://localhost:5173"

    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject: "💰 Your Quote is Ready",
      html: `
        <div style="font-family: Arial; padding: 20px; max-width:600px;">
          <h2>Signavi Studio</h2>

          <p>Hello ${quote.customerName || "Customer"},</p>

          <p>Your quote is ready.</p>

          <p><strong>Quote ID:</strong> ${quote._id}</p>
          <h3>$${(quote.price || 0).toFixed(2)}</h3>

          <a href="${FRONTEND_URL}/checkout/${quote._id}"
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
        </div>
      `
    })

    console.log("✅ QUOTE EMAIL SENT:", info.response)

  } catch (error) {
    console.error("❌ QUOTE EMAIL FAILED:", error)
  }
}

/* ================= ABANDONED CART ================= */
export const sendAbandonedCartEmail = async (to, cartDoc) => {
  try {
    const target = to || process.env.EMAIL_USER

    if (!cartDoc?.items?.length) return

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "http://localhost:5173"

    const itemsHtml = cartDoc.items.map(item => `
      <li>
        ${item.name} (x${item.quantity}) - $${item.price}
      </li>
    `).join("")

    const info = await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject: "🛒 You left items in your cart",
      html: `
        <div style="font-family: Arial; padding:20px;">
          <h2>👀 Forgot something?</h2>
          <ul>${itemsHtml}</ul>

          <a href="${FRONTEND_URL}/cart"
            style="display:inline-block;padding:12px 20px;background:#22c55e;color:#000;border-radius:6px;">
            Return to Cart
          </a>
        </div>
      `
    })

    console.log("📧 Abandoned cart email sent:", info.response)

  } catch (err) {
    console.error("❌ Abandoned cart email failed:", err)
  }
}
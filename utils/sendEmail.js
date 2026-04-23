import nodemailer from "nodemailer"
import fs from "fs"

let transporter

/* =========================================================
   📦 CREATE TRANSPORTER
========================================================= */
const getTransporter = () => {
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })

  return transporter
}

/* =========================================================
   🔗 SAFE URL BUILDER
========================================================= */
const buildSafeUrl = (base, path = "") => {
  let url = base || "signavistudio.store"

  url = url.trim()
  url = url.replace(/^(https?:)?\/?\//i, "")
  url = url.replace(/^ttps?:?\/?\/?/i, "")

  url = `https://${url}`

  if (url.endsWith("/")) {
    url = url.slice(0, -1)
  }

  return `${url}${path}`
}

/* =========================================================
   🔧 LINK SANITIZER
========================================================= */
const sanitizeLink = (link, fallback) => {
  let finalLink = link || fallback

  if (!finalLink) return fallback

  finalLink = finalLink.trim()

  if (finalLink.startsWith("ttps://")) {
    finalLink = "h" + finalLink
  }

  if (finalLink.startsWith("https//")) {
    finalLink = finalLink.replace("https//", "https://")
  }

  if (!finalLink.startsWith("http")) {
    finalLink = buildSafeUrl(finalLink)
  }

  return finalLink
}

/* =========================================================
   📧 SEND ORDER STATUS EMAIL
========================================================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  id,
  order = {}
) => {
  try {
    const transporter = getTransporter()

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    const successLink = buildSafeUrl(CLIENT_URL, `/success/${id}`)
    const paymentFallback = buildSafeUrl(CLIENT_URL, `/checkout/${id}`)

    const paymentLink = sanitizeLink(order?.paymentUrl, paymentFallback)

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    let attachments = []

    /* ================= PAYMENT REQUIRED ================= */
    if (status === "payment_required") {
      subject = "Your Order is Ready – Payment Required"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your order is ready for payment.</p>

        <h3>Total: $${order?.finalPrice || order?.price || 0}</h3>

        <p>
          <a href="${paymentLink}" target="_blank"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#06b6d4;
              color:#000;
              text-decoration:none;
              border-radius:6px;
              font-weight:bold;
            ">
            💳 Pay Now
          </a>
        </p>
      `
    }

    /* ================= PAYMENT SUCCESS ================= */
    else if (status === "paid") {
      subject = "Payment Received – Order Confirmed"

      html += `
        <p>Hi ${order?.customerName || "Customer"},</p>

        <p>We’ve received your payment 🎉</p>

        <h3>Total Paid: $${order?.finalPrice || order?.price || 0}</h3>

        <p>
          <a href="${successLink}" target="_blank">
            View Order Status →
          </a>
        </p>
      `

      /* 📄 ATTACH INVOICE */
      if (order.invoice && fs.existsSync(order.invoice)) {
        attachments.push({
          filename: `invoice-${id}.pdf`,
          path: order.invoice
        })
      }
    }

    /* ================= SHIPPED ================= */
    else if (status === "shipped") {
      subject = "Your Order Has Shipped 📦"

      html += `
        <p>Hi ${order?.customerName || "Customer"},</p>

        <p>Your order is on the way!</p>

        <p><strong>Tracking Number:</strong> ${order.trackingNumber || "N/A"}</p>

        ${
          order.trackingLink
            ? `<p><a href="${order.trackingLink}" target="_blank">Track Package →</a></p>`
            : ""
        }
      `
    }

    /* ================= DEFAULT ================= */
    else {
      html += `<p>Status updated: ${status}</p>`
    }

    /* ================= FOOTER ================= */
    html += `
      <p style="margin-top:20px;">
        Thank you,<br/>
        <strong>SignaVi Studio</strong>
      </p>
    `

    await transporter.sendMail({
      from: `"SignaVi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments
    })

    console.log("📧 EMAIL SENT →", to)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}

/* =========================================================
   📧 ABANDONED CART (PLACEHOLDER)
========================================================= */
export const sendAbandonedCartEmail = async (email, cart = []) => {
  try {
    console.log("📧 Abandoned cart →", email)
    console.log("🛒 Cart:", cart)
  } catch (err) {
    console.error("❌ Abandoned cart error:", err)
  }
}
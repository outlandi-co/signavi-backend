import nodemailer from "nodemailer"

/* ================= DEBUG ================= */
console.log("📧 EMAIL DEBUG:", {
  user: process.env.EMAIL_USER,
  pass: process.env.EMAIL_PASS ? "exists" : "missing"
})

/* ================= LAZY TRANSPORTER ================= */
let transporter = null

const getTransporter = () => {
  if (transporter) return transporter

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("❌ EMAIL ENV NOT SET")
    return null
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  })

  transporter.verify((err) => {
    if (err) {
      console.error("❌ EMAIL SERVER ERROR:", err.message)
    } else {
      console.log("✅ EMAIL SERVER READY")
    }
  })

  return transporter
}

/* ================= WRAPPER ================= */
const wrap = (content) => `
  <div style="font-family: Arial; padding: 20px;">
    <h2>Signavi Studio</h2>
    ${content}
  </div>
`

/* =========================================================
   📄 QUOTE EMAIL
========================================================= */
export const sendQuoteEmail = async (to, quote) => {
  try {
    const transporter = getTransporter()
    if (!transporter) return

    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject: "📄 Quote Received",
      html: wrap(`<p>Your quote has been received.</p>`)
    })
  } catch (err) {
    console.error("❌ QUOTE EMAIL ERROR:", err.message)
  }
}

/* =========================================================
   📦 STATUS EMAIL (🔥 FINAL PAY BUTTON FIX)
========================================================= */
export const sendOrderStatusEmail = async (to, status, id, order) => {
  try {
    const transporter = getTransporter()
    if (!transporter) return

    const CLIENT_URL =
      process.env.CLIENT_URL ||
      "https://signavistudio.store"

    let subject = "Order Update"
    let html = ""

    /* 🔥 ALWAYS FALLBACK TO CHECKOUT ROUTE */
    const paymentLink =
      order?.paymentUrl ||
      `${CLIENT_URL}/checkout/${id}`

    if (status === "payment_required" || status === "approved") {
      subject = "💳 Payment Required — Complete Your Order"

      html = wrap(`
        <p>Your order is ready for payment 🎉</p>
        <p>Please complete payment to begin production.</p>

        <div style="margin-top:20px;">
          <a href="${paymentLink}"
            style="
              display:inline-block;
              padding:14px 24px;
              background:#06b6d4;
              color:#000;
              text-decoration:none;
              border-radius:8px;
              font-weight:bold;
            ">
            💳 Pay Now
          </a>
        </div>

        <p style="margin-top:15px; font-size:12px; opacity:0.7;">
          If the button doesn't work, copy this link:
          <br/>
          ${paymentLink}
        </p>
      `)

    } else if (status === "denied") {
      subject = "❌ Revision Required"

      html = wrap(`
        <p><b>Reason:</b> ${order?.denialReason || "N/A"}</p>
        <p><b>Revision Fee:</b> $${order?.revisionFee || 0}</p>
      `)

    } else if (status === "paid") {
      subject = "💰 Payment Received"

      html = wrap(`
        <p>Your payment has been received.</p>
        <p>Your order is now entering production.</p>
      `)

    } else {
      html = wrap(`<p>Status: ${status}</p>`)
    }

    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    })

    console.log("📧 STATUS EMAIL SENT:", status)

  } catch (err) {
    console.error("❌ STATUS EMAIL ERROR:", err.message)
  }
}

/* =========================================================
   🔔 NOTIFICATION EMAIL
========================================================= */
export const sendNotificationEmail = async (to, subject, message) => {
  try {
    const transporter = getTransporter()
    if (!transporter) return

    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: wrap(`<p>${message}</p>`)
    })

    console.log("📧 Notification email sent:", to)

  } catch (err) {
    console.error("❌ Notification email error:", err.message)
  }
}

/* =========================================================
   🛒 ABANDONED CART EMAIL
========================================================= */
export const sendAbandonedCartEmail = async (cart) => {
  try {
    const transporter = getTransporter()
    if (!transporter) return

    const itemsList = cart.items.map(item => `
      <li>${item.name} (x${item.quantity}) - $${item.price}</li>
    `).join("")

    const CLIENT_URL =
      process.env.CLIENT_URL ||
      "http://localhost:5173"

    const link = cart.discountCode
      ? `${CLIENT_URL}/store?code=${cart.discountCode}&discount=${cart.discountPercent}`
      : `${CLIENT_URL}/store`

    await transporter.sendMail({
      from: `"Signavi Store" <${process.env.EMAIL_USER}>`,
      to: cart.email,
      subject: "🛒 You left items in your cart!",
      html: wrap(`
        <h2>Don't miss out 👀</h2>
        <ul>${itemsList}</ul>

        <p>
          👉 <a href="${link}">Return to your cart</a>
        </p>
      `)
    })

    console.log("📧 Abandoned cart email sent:", cart.email)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err.message)
  }
}
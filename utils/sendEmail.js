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
    <h1 style="margin-bottom:10px;">Signavi Studio</h1>
    ${content}
  </div>
`

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

    /* 🔥 ALWAYS CREATE FALLBACK PAYMENT LINK */
    const paymentLink =
      order?.paymentUrl ||
      `${CLIENT_URL}/checkout/${id}`

    let subject = "Order Update"
    let html = ""

    /* ================= PAYMENT REQUIRED ================= */
    if (status === "payment_required" || status === "approved") {
      subject = "💳 Payment Required — Complete Your Order"

      html = wrap(`
        <p style="font-size:16px;">
          Your order is ready for payment 🎉
        </p>

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
              font-size:16px;
            ">
            💳 Pay Now
          </a>
        </div>

        <p style="margin-top:20px; font-size:12px; opacity:0.7;">
          If the button doesn't work, copy this link:
          <br/>
          ${paymentLink}
        </p>
      `)

    }

    /* ================= DENIED ================= */
    else if (status === "denied") {
      subject = "❌ Revision Required"

      html = wrap(`
        <p><b>Reason:</b> ${order?.denialReason || "N/A"}</p>
        <p><b>Revision Fee:</b> $${order?.revisionFee || 0}</p>
      `)
    }

    /* ================= PAID ================= */
    else if (status === "paid") {
      subject = "💰 Payment Received"

      html = wrap(`
        <p>Your payment has been received.</p>
        <p>Your order is now entering production.</p>
      `)
    }

    /* ================= FALLBACK ================= */
    else {
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
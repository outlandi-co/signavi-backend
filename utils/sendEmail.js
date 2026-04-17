import nodemailer from "nodemailer"

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* 🔥 VERIFY (SAFE) */
transporter.verify((err) => {
  if (err) {
    console.error("❌ EMAIL SERVER ERROR:", err)
  } else {
    console.log("✅ EMAIL SERVER READY")
  }
})

/* ================= WRAPPER ================= */
const wrap = (content) => `
  <div style="font-family: Arial; padding: 20px; max-width:600px;">
    <h2>Signavi Studio</h2>
    ${content}
  </div>
`

/* =========================================================
   📄 QUOTE EMAIL
========================================================= */
export const sendQuoteEmail = async (to, quote = {}) => {
  try {
    const target = to || process.env.EMAIL_USER

    if (!target) {
      console.warn("⚠️ No email target provided")
      return
    }

    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject: "📄 Quote Received — Under Review",

      html: wrap(`
        <p>Hello ${quote?.customerName || "Customer"},</p>

        <h3>📄 We received your quote request</h3>

        <p>Your artwork is currently being reviewed.</p>

        <p><b>Quote ID:</b> ${quote?._id || "N/A"}</p>
        <p><b>Estimated Price:</b> $${Number(quote?.price || 0).toFixed(2)}</p>

        <p>⏳ You will receive another email once approved.</p>
      `)
    })

    console.log("📧 QUOTE EMAIL SENT →", target)

  } catch (err) {
    console.error("❌ QUOTE EMAIL FAILED:", err.message)
  }
}

/* =========================================================
   📦 ORDER / STATUS EMAIL
========================================================= */
export const sendOrderStatusEmail = async (
  to,
  status,
  orderId,
  order = {}
) => {
  try {
    const target = to || process.env.EMAIL_USER
    const FRONTEND_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    if (!target) {
      console.warn("⚠️ No email target provided")
      return
    }

    let subject = ""
    let html = ""

    /* ================= APPROVED ================= */
    if (status === "approved") {
      subject = "✅ Artwork Approved — Complete Payment"

      html = wrap(`
        <p>Hello ${order?.customerName || "Customer"},</p>

        <h3 style="color:#22c55e;">✅ Your artwork is approved!</h3>

        <p>You can now complete your payment:</p>

        <a href="${FRONTEND_URL}/quote/${orderId}"
          style="display:inline-block;padding:12px 20px;background:#06b6d4;color:white;border-radius:6px;">
          💳 Complete Payment
        </a>
      `)
    }

    /* ================= DENIED ================= */
    else if (status === "denied") {
      subject = "❌ Artwork Needs Revision"

      html = wrap(`
        <h3 style="color:#ef4444;">❌ Revision Required</h3>

        <p><b>Reason:</b> ${order?.denialReason || "Artwork issue"}</p>

        ${
          Number(order?.revisionFee) > 0
            ? `<p><b>Revision Fee:</b> $${Number(order.revisionFee).toFixed(2)}</p>`
            : ""
        }

        <p>Please update your artwork and resubmit.</p>
      `)
    }

    /* ================= PAYMENT REQUIRED ================= */
    else if (status === "payment_required") {
      subject = "💳 Payment Required"

      html = wrap(`
        <p>Your order is ready for payment.</p>

        <a href="${FRONTEND_URL}/checkout/${orderId}"
          style="display:inline-block;padding:12px 20px;background:#06b6d4;color:white;border-radius:6px;">
          💳 Pay Now
        </a>
      `)
    }

    /* ================= PAID ================= */
    else if (status === "paid") {
      subject = "✅ Payment Received"

      html = wrap(`
        <p>Your payment has been successfully received.</p>
        <p>We are now preparing your order for production.</p>
      `)
    }

    /* ================= FALLBACK ================= */
    else {
      subject = "📦 Order Update"

      html = wrap(`
        <p>Status update:</p>
        <p><b>${status}</b></p>
      `)
    }

    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to: target,
      subject,
      html
    })

    console.log(`📧 STATUS EMAIL SENT → ${target} (${status})`)

  } catch (err) {
    console.error("❌ STATUS EMAIL FAILED:", err.message)
  }
}
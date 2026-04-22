import nodemailer from "nodemailer"

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
   🔗 SAFE URL BUILDER (FIXES https BUG)
========================================================= */
const buildSafeUrl = (base, path = "") => {
  let url = base || "https://signavistudio.store"

  // remove spaces
  url = url.trim()

  // force https if missing
  if (!url.startsWith("http")) {
    url = `https://${url}`
  }

  // remove trailing slash
  if (url.endsWith("/")) {
    url = url.slice(0, -1)
  }

  return `${url}${path}`
}

/* =========================================================
   📧 SEND ORDER / QUOTE STATUS EMAIL
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

    /* 🔥 ALWAYS SAFE LINK */
    const fallbackLink = buildSafeUrl(CLIENT_URL, `/quote/${id}`)

    /* 🔥 PRIORITY: SQUARE LINK IF EXISTS */
    const paymentLink = order?.paymentUrl || fallbackLink

    console.log("🔗 EMAIL LINK:", paymentLink)

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    /* ================= PAYMENT REQUIRED ================= */
    if (status === "payment_required") {
      subject = "Your Order is Ready – Payment Required"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your order is ready for payment.</p>

        <h3>Total: $${order?.price || 0}</h3>

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

        <p><strong>Direct link:</strong></p>
        <p style="word-break:break-all;">
          <a href="${paymentLink}" target="_blank">
            ${paymentLink}
          </a>
        </p>

        <p style="margin-top:20px;">
          Thank you,<br/>
          <strong>SignaVi Studio</strong>
        </p>
      `
    } else {
      html += `<p>Status updated: ${status}</p>`
    }

    await transporter.sendMail({
      from: `"SignaVi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    })

    console.log("📧 EMAIL SENT →", to)

  } catch (err) {
    console.error("❌ EMAIL ERROR:", err)
  }
}

/* =========================================================
   📧 ABANDONED CART (FIXES YOUR ERROR)
========================================================= */
export const sendAbandonedCartEmail = async (email, cart = []) => {
  try {
    console.log("📧 Abandoned cart email →", email)
    console.log("🛒 Cart:", cart)

    const transporter = getTransporter()

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavistudio.store"

    const link = buildSafeUrl(CLIENT_URL, "/cart")

    const html = `
      <h2>SignaVi Studio</h2>

      <p>You left items in your cart 👀</p>

      <p>
        <a href="${link}" target="_blank"
          style="
            display:inline-block;
            padding:12px 20px;
            background:#06b6d4;
            color:#000;
            text-decoration:none;
            border-radius:6px;
          ">
          🛒 Return to Cart
        </a>
      </p>
    `

    await transporter.sendMail({
      from: `"SignaVi Studio" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "You left something behind 👀",
      html
    })

  } catch (err) {
    console.error("❌ Abandoned cart email error:", err)
  }
}
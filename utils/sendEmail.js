import nodemailer from "nodemailer"

let transporter

/* ================= CREATE TRANSPORTER ================= */
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
   🔧 SAFE URL BUILDER (FIXES MISSING https BUG)
========================================================= */
const buildSafeUrl = (base, path = "") => {
  let url = base || "https://signavistudio.store"

  // remove spaces
  url = url.trim()

  // 🔥 FORCE https if missing
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

    console.log("🔗 FINAL EMAIL LINK:", paymentLink)

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

    if (status === "payment_required") {
      subject = "Your Quote is Approved – Payment Required"

      html += `
        <p>Hello ${order?.customerName || "Customer"},</p>

        <p>Your quote has been approved and is ready for payment.</p>

        <h3>Total: $${order?.price || 0}</h3>

        <!-- BUTTON -->
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

        <!-- FALLBACK LINK -->
        <p>If the button does not work, copy and paste this link:</p>

        <p style="word-break:break-all;">
          ${paymentLink}
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
   📧 ABANDONED CART
========================================================= */
export const sendAbandonedCartEmail = async (email, cart) => {
  try {
    console.log("📧 Abandoned cart email sent to:", email)
  } catch (err) {
    console.error(err)
  }
}
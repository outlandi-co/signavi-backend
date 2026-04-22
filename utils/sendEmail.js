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
   🔗 BULLETPROOF URL BUILDER
========================================================= */
const buildSafeUrl = (base, path = "") => {
  let url = base || "signavistudio.store"

  url = url.trim()

  // 🔥 REMOVE ANY BROKEN PROTOCOLS
  url = url.replace(/^(https?:)?\/?\//i, "")
  url = url.replace(/^ttps?:?\/?\/?/i, "")

  // 🔥 FORCE CLEAN HTTPS
  url = `https://${url}`

  // remove trailing slash
  if (url.endsWith("/")) {
    url = url.slice(0, -1)
  }

  return `${url}${path}`
}

/* =========================================================
   🔧 FINAL LINK SANITIZER (LAST LINE OF DEFENSE)
========================================================= */
const sanitizeLink = (link, fallback) => {
  let finalLink = link || fallback

  if (!finalLink) return fallback

  finalLink = finalLink.trim()

  // 🔥 FIX: "ttps://"
  if (finalLink.startsWith("ttps://")) {
    finalLink = "h" + finalLink
  }

  // 🔥 FIX: "https//"
  if (finalLink.startsWith("https//")) {
    finalLink = finalLink.replace("https//", "https://")
  }

  // 🔥 STILL BAD? rebuild it
  if (!finalLink.startsWith("http")) {
    finalLink = buildSafeUrl(finalLink)
  }

  return finalLink
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

    const fallbackLink = buildSafeUrl(CLIENT_URL, `/quote/${id}`)

    /* 🔥 PRIORITY: ALWAYS USE VALID LINK */
    const paymentLink = sanitizeLink(order?.paymentUrl, fallbackLink)

    console.log("🔗 FINAL EMAIL LINK:", paymentLink)

    let subject = "SignaVi Studio Update"
    let html = `<h2>SignaVi Studio</h2>`

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
export const sendAbandonedCartEmail = async (email, cart = []) => {
  try {
    console.log("📧 Abandoned cart →", email)
    console.log("🛒 Cart:", cart)
  } catch (err) {
    console.error(err)
  }
}
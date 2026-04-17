import nodemailer from "nodemailer"

/* ================= TRANSPORT ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

/* ================= VERIFY ================= */
transporter.verify((err) => {
  if (err) {
    console.error("❌ EMAIL SERVER ERROR:", err)
  } else {
    console.log("✅ EMAIL SERVER READY")
  }
})

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
    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject: "📄 Quote Received",
      html: wrap(`<p>Your quote has been received.</p>`)
    })
  } catch (err) {
    console.error("❌ QUOTE EMAIL ERROR:", err)
  }
}

/* =========================================================
   📦 STATUS EMAIL
========================================================= */
export const sendOrderStatusEmail = async (to, status, id, order) => {
  try {
    let subject = "Order Update"
    let html = ""

    if (status === "approved") {
      subject = "✅ Approved — Complete Payment"
      html = wrap(`
        <p>Your artwork is approved.</p>
        <a href="${process.env.CLIENT_URL}/quote/${id}">
          Pay Now
        </a>
      `)
    } else if (status === "denied") {
      subject = "❌ Revision Required"
      html = wrap(`
        <p><b>Reason:</b> ${order?.denialReason || "N/A"}</p>
        <p>Fee: $${order?.revisionFee || 0}</p>
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

    console.log("📧 STATUS EMAIL SENT")

  } catch (err) {
    console.error("❌ STATUS EMAIL ERROR:", err)
  }
}

/* =========================================================
   🔔 NOTIFICATION EMAIL (🔥 FIX)
========================================================= */
export const sendNotificationEmail = async (to, subject, message) => {
  try {
    await transporter.sendMail({
      from: `"Signavi Studio" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: wrap(`<p>${message}</p>`)
    })

    console.log("📧 Notification email sent:", to)

  } catch (err) {
    console.error("❌ Notification email error:", err)
  }
}

/* =========================================================
   🛒 ABANDONED CART EMAIL
========================================================= */
export const sendAbandonedCartEmail = async (cart) => {
  try {
    const itemsList = cart.items.map(item => `
      <li>${item.name} (x${item.quantity}) - $${item.price}</li>
    `).join("")

    const CLIENT_URL =
      process.env.CLIENT_URL || "https://signavi-studio.netlify.app"

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
    console.error("❌ EMAIL ERROR:", err)
  }
}
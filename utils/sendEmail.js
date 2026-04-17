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
   📦 STATUS EMAIL (🔥 THIS WAS MISSING / BROKEN)
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
    }

    else if (status === "denied") {
      subject = "❌ Revision Required"
      html = wrap(`
        <p><b>Reason:</b> ${order.denialReason}</p>
        <p>Fee: $${order.revisionFee || 0}</p>
      `)
    }

    else {
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